process.env.DATABASE_URL = 'postgresql://deuce:deuce@localhost:5434/deuce_test'
process.env.SESSION_KEY_HEX = 'a'.repeat(64)
process.env.GOOGLE_CLIENT_ID = 'test-client-id'
process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret'
process.env.GOOGLE_CALLBACK_URL = 'http://localhost:4000/auth/google/callback'
process.env.ALLOWED_EMAILS = 'a@goldenlabs.dev,b@goldenlabs.dev,c@goldenlabs.dev'
process.env.UPLOAD_DIR = './uploads-test'
