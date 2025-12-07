import { db } from '../config/database';
import { faqs } from '../models/contact';

const sampleFAQs = [
  {
    question: 'How do I search for properties?',
    answer: 'You can browse properties on our home screen. Use filters to narrow down your search by location, price range, and property type.',
    orderIndex: 1
  },
  {
    question: 'Can I schedule property visits?',
    answer: 'Yes! Contact the property agent directly through the app or call our office to schedule a visit at your convenience.',
    orderIndex: 2
  },
  {
    question: 'What documents do I need for buying?',
    answer: 'You will need identity proof, address proof, income documents, and bank statements. Our agents will guide you through the complete documentation process.',
    orderIndex: 3
  },
  {
    question: 'Do you provide home loans assistance?',
    answer: 'Yes, we have partnerships with leading banks and can help you get the best home loan rates and process your application.',
    orderIndex: 4
  },
  {
    question: 'How can I list my property?',
    answer: 'If you are an agent, you can list properties through your agent dashboard. For property owners, please contact our office for listing assistance.',
    orderIndex: 5
  }
];

export const seedFAQs = async () => {
  try {
    console.log('Seeding FAQs...');
    await db.insert(faqs).values(sampleFAQs);
    console.log('FAQs seeded successfully');
  } catch (error) {
    console.error('Error seeding FAQs:', error);
  }
};

// Run if called directly
if (require.main === module) {
  seedFAQs().then(() => process.exit(0));
}