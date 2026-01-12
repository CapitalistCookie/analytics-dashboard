import { test as base, expect, Page } from '@playwright/test';

// Test user credentials - use existing admin for most tests
export const TEST_USERS = {
  admin: {
    username: 'capitalistcookie@gmail.com',
    password: 'Easyas123!@#',
    role: 'admin',
  },
  manager: {
    username: 'e2e_manager',
    password: 'TestManager123',
    role: 'manager',
  },
  viewer: {
    username: 'e2e_viewer',
    password: 'TestViewer123',
    role: 'viewer',
  },
};

const API_BASE = 'http://localhost:8000';

// Helper to make API calls
async function apiCall(endpoint: string, options: RequestInit = {}) {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  return response;
}

// Helper to get auth token
async function getAuthToken(username: string, password: string): Promise<string | null> {
  const formData = new URLSearchParams();
  formData.append('username', username);
  formData.append('password', password);

  const response = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formData,
  });

  if (response.ok) {
    const data = await response.json();
    return data.access_token;
  }
  return null;
}

// Seed test users if they don't exist
export async function seedTestUsers() {
  // First, try to login as the main admin to get a token
  let adminToken = await getAuthToken('capitalistcookie', 'Easyas123!@#');

  if (!adminToken) {
    // Try registering a new admin (first user becomes admin)
    const regResponse = await apiCall('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        username: 'capitalistcookie',
        password: 'Easyas123!@#',
        email: 'admin@test.com',
      }),
    });
    if (regResponse.ok) {
      adminToken = await getAuthToken('capitalistcookie', 'Easyas123!@#');
    }
  }

  if (!adminToken) {
    console.error('Could not get admin token for seeding');
    return;
  }

  // Create test users for manager and viewer roles
  const usersToCreate = [
    { key: 'manager', user: TEST_USERS.manager },
    { key: 'viewer', user: TEST_USERS.viewer },
  ];

  for (const { key, user } of usersToCreate) {
    // Check if user exists by trying to login
    const existingToken = await getAuthToken(user.username, user.password);
    if (existingToken) {
      console.log(`User ${user.username} already exists`);
      continue;
    }

    // Create user via admin API
    const createResponse = await fetch(`${API_BASE}/api/admin/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        username: user.username,
        password: user.password,
        email: `${key}@test.com`,
        role: user.role,
      }),
    });

    if (createResponse.ok) {
      console.log(`Created user ${user.username} with role ${user.role}`);
    } else {
      const text = await createResponse.text();
      console.log(`Failed to create ${user.username}: ${text}`);
    }
  }
}

// Seed test staff members
export async function seedTestStaff(token: string) {
  const staffMembers = [
    { name: 'Test Staff 1', role: 'Server', badge_id: 'TS001' },
    { name: 'Test Staff 2', role: 'Host', badge_id: 'TS002' },
  ];

  for (const staff of staffMembers) {
    await fetch(`${API_BASE}/api/staff`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(staff),
    });
  }
}

// Login helper for page
export async function loginAs(page: Page, role: 'admin' | 'manager' | 'viewer') {
  const user = TEST_USERS[role];
  await page.goto('/login');
  await page.waitForSelector('#username', { timeout: 10000 });
  await page.fill('#username', user.username);
  await page.fill('#password', user.password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/^(?!.*login)/, { timeout: 10000 });
}

// Extended test fixture with authentication helpers
export const test = base.extend<{
  authenticatedPage: Page;
  adminPage: Page;
  managerPage: Page;
  viewerPage: Page;
}>({
  authenticatedPage: async ({ page }, use) => {
    await loginAs(page, 'admin');
    await use(page);
  },
  adminPage: async ({ page }, use) => {
    await loginAs(page, 'admin');
    await use(page);
  },
  managerPage: async ({ page }, use) => {
    await loginAs(page, 'manager');
    await use(page);
  },
  viewerPage: async ({ page }, use) => {
    await loginAs(page, 'viewer');
    await use(page);
  },
});

export { expect };
