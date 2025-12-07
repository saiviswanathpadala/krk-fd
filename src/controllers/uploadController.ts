import { Request, Response } from 'express';
import { z } from 'zod';
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { db } from '../config/database';
import { uploads } from '../models/upload';
import { eq } from 'drizzle-orm';

interface AuthRequest extends Request {
  user?: { userId: number; role?: string };
}

const s3Client = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

const signedUrlSchema = z.object({
  filename: z.string().min(1).optional(),
  fileName: z.string().min(1).optional(),
  contentType: z.string().min(1),
  size: z.number().optional(),
  purpose: z.enum(['property_image', 'brochure', 'profile', 'banner']).optional().default('profile'),
  clientUploadId: z.string().uuid().optional(),
}).refine((data) => data.filename || data.fileName, {
  message: "Either filename or fileName must be provided"
});

export const getSignedUploadUrl = async (req: AuthRequest, res: Response) => {
  try {
    const parsed = signedUrlSchema.parse(req.body);
    const filename = parsed.filename || parsed.fileName!;
    const { contentType, size, purpose, clientUploadId } = parsed;
    const userId = req.user!.userId;
    
    const maxSize = purpose === 'brochure' ? 50 * 1024 * 1024 : 10 * 1024 * 1024;
    if (size && size > maxSize) {
      return res.status(400).json({ 
        message: `File too large. Maximum size is ${maxSize / (1024 * 1024)}MB` 
      });
    }
    
    const allowedTypes = {
      property_image: ['image/jpeg', 'image/png', 'image/webp'],
      brochure: ['application/pdf'],
      profile: ['image/jpeg', 'image/png', 'image/webp'],
      banner: ['image/jpeg', 'image/png', 'image/webp']
    };
    
    if (!allowedTypes[purpose].includes(contentType)) {
      return res.status(400).json({ 
        message: `Invalid content type for ${purpose}` 
      });
    }
    
    const timestamp = Date.now();
    const key = `${purpose}/${userId}/${timestamp}-${filename}`;
    
    const [upload] = await db.insert(uploads).values({
      key,
      ownerId: userId,
      purpose,
      clientUploadId: clientUploadId || undefined,
      status: 'created',
      size: size || null,
      contentType,
    }).returning();
    
    const command = new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME!,
      Key: key,
      ContentType: contentType,
    });
    
    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
    const publicUrl = `${process.env.R2_PUBLIC_URL}/${key}`;
    
    res.json({
      uploadUrl,
      publicUrl,
      key,
      uploadId: upload.id,
      expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
      resumable: false,
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: error.issues[0].message });
    }
    console.error('Error generating signed URL:', error);
    res.status(500).json({ message: 'Failed to generate upload URL' });
  }
};

export const completeUpload = async (req: AuthRequest, res: Response) => {
  try {
    const { uploadId } = req.params;
    const userId = req.user!.userId;
    
    const [upload] = await db.select().from(uploads)
      .where(eq(uploads.id, uploadId))
      .limit(1);
    
    if (!upload || upload.ownerId !== userId) {
      return res.status(404).json({ message: 'Upload not found' });
    }
    
    try {
      const headCommand = new HeadObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME!,
        Key: upload.key,
      });
      await s3Client.send(headCommand);
      
      await db.update(uploads)
        .set({ status: 'uploaded', updatedAt: new Date() })
        .where(eq(uploads.id, uploadId));
      
      res.json({ status: 'uploaded', uploadId });
    } catch (error) {
      return res.status(400).json({ message: 'File not found in storage' });
    }
  } catch (error) {
    console.error('Error completing upload:', error);
    res.status(500).json({ message: 'Failed to complete upload' });
  }
};