-- Create contact_messages table
CREATE TABLE "contact_messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" text NOT NULL,
  "email" text NOT NULL,
  "subject" text NOT NULL,
  "message" text NOT NULL,
  "created_at" timestamp DEFAULT now()
);

-- Create faqs table
CREATE TABLE "faqs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "question" text NOT NULL,
  "answer" text NOT NULL,
  "order_index" integer DEFAULT 0
);

-- Insert sample FAQs
INSERT INTO "faqs" ("question", "answer", "order_index") VALUES
('How do I search for properties?', 'You can browse properties on our home screen. Use filters to narrow down your search by location, price range, and property type.', 1),
('Can I schedule property visits?', 'Yes! Contact the property agent directly through the app or call our office to schedule a visit at your convenience.', 2),
('What documents do I need for buying?', 'You will need identity proof, address proof, income documents, and bank statements. Our agents will guide you through the complete documentation process.', 3),
('Do you provide home loans assistance?', 'Yes, we have partnerships with leading banks and can help you get the best home loan rates and process your application.', 4),
('How can I list my property?', 'If you are an agent, you can list properties through your agent dashboard. For property owners, please contact our office for listing assistance.', 5);