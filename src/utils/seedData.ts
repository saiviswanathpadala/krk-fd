import { db } from '../config/database';
import { properties } from '../models/property';

const sampleProperties = [
  {
    title: 'Modern Luxury Villa',
    price: '2500000',
    location: 'Greenwich, Connecticut',
    type: 'Featured',
    images: [
      'https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=800',
      'https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=800',
      'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=800'
    ],
    description: 'Experience unparalleled luxury in this stunning modern villa. Featuring an open-concept living space, gourmet kitchen, and breathtaking views, this property is an oasis of comfort and style.',
    features: ['Single-Family Home', '3,200 sqft', '4 Bedrooms', '3 Bathrooms', 'Built in 2021'],
    amenities: ['Pool', 'Garden', 'Gym', 'Parking'],
    latitude: '41.0262',
    longitude: '-73.6284'
  },
  {
    title: 'Downtown Penthouse',
    price: '1800000',
    location: 'Manhattan, New York',
    type: 'New Listing',
    images: [
      'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=800',
      'https://images.unsplash.com/photo-1571055107559-3e67626fa8be?w=800'
    ],
    description: 'Sophisticated penthouse with panoramic city views. This elegant residence offers premium finishes and world-class amenities in the heart of Manhattan.',
    features: ['Penthouse', '2,800 sqft', '3 Bedrooms', '2 Bathrooms', 'Built in 2019'],
    amenities: ['Concierge', 'Rooftop Terrace', 'Fitness Center', 'Valet Parking'],
    latitude: '40.7589',
    longitude: '-73.9851'
  },
  {
    title: 'Waterfront Estate',
    price: '3200000',
    location: 'Malibu, California',
    type: 'Featured',
    images: [
      'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=800',
      'https://images.unsplash.com/photo-1570129477492-45c003edd2be?w=800'
    ],
    description: 'Breathtaking oceanfront estate with private beach access. This architectural masterpiece combines luxury living with natural beauty.',
    features: ['Oceanfront', '4,500 sqft', '5 Bedrooms', '4 Bathrooms', 'Built in 2020'],
    amenities: ['Private Beach', 'Infinity Pool', 'Wine Cellar', 'Guest House'],
    latitude: '34.0259',
    longitude: '-118.7798'
  },
  {
    title: 'Historic Brownstone',
    price: '1200000',
    location: 'Boston, Massachusetts',
    type: 'Open House',
    images: [
      'https://images.unsplash.com/photo-1449844908441-8829872d2607?w=800'
    ],
    description: 'Charming historic brownstone with original architectural details. Beautifully restored while maintaining its classic character.',
    features: ['Historic Home', '2,400 sqft', '3 Bedrooms', '2 Bathrooms', 'Built in 1890'],
    amenities: ['Fireplace', 'Hardwood Floors', 'Private Garden', 'Storage'],
    latitude: '42.3601',
    longitude: '-71.0589'
  },
  {
    title: 'Contemporary Townhouse',
    price: '950000',
    location: 'Austin, Texas',
    type: 'New Listing',
    images: [
      'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800'
    ],
    description: 'Sleek contemporary townhouse in vibrant downtown district. Perfect blend of modern design and urban convenience.',
    features: ['Townhouse', '2,100 sqft', '3 Bedrooms', '2.5 Bathrooms', 'Built in 2022'],
    amenities: ['Rooftop Deck', 'Smart Home', 'Garage', 'Community Pool'],
    latitude: '30.2672',
    longitude: '-97.7431'
  }
];

export const seedProperties = async () => {
  try {
    console.log('Clearing existing properties...');
    await db.delete(properties);
    
    console.log('Seeding properties...');
    
    // Use only the base properties (15 total)
    const allProperties = [];
    for (let i = 0; i < 3; i++) {
      allProperties.push(...sampleProperties.map(prop => ({
        ...prop,
        title: `${prop.title} ${i > 0 ? `- Unit ${i + 1}` : ''}`,
        price: (parseInt(prop.price) + i * 50000).toString(),
        latitude: (parseFloat(prop.latitude) + (i * 0.01)).toString(),
        longitude: (parseFloat(prop.longitude) + (i * 0.01)).toString()
      })));
    }
    
    await db.insert(properties).values(allProperties);
    console.log(`Seeded ${allProperties.length} properties successfully`);
  } catch (error) {
    console.error('Error seeding properties:', error);
  }
};