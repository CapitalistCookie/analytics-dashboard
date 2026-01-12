import { seedTestUsers } from './fixtures';

async function globalSetup() {
  console.log('Seeding test database...');

  // Wait for services to be ready
  const maxRetries = 30;
  let retries = 0;

  while (retries < maxRetries) {
    try {
      const response = await fetch('http://localhost:8000/api/health');
      if (response.ok) {
        console.log('Backend is ready');
        break;
      }
    } catch {
      // Service not ready yet
    }
    retries++;
    await new Promise(r => setTimeout(r, 1000));
  }

  if (retries >= maxRetries) {
    throw new Error('Backend service not ready after 30 seconds');
  }

  // Seed test users
  await seedTestUsers();
  console.log('Test users seeded');
}

export default globalSetup;
