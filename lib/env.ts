const apiUrl = process.env.NEXT_PUBLIC_API_URL;

if (!apiUrl) {
  throw new Error('NEXT_PUBLIC_API_URL is not defined in environment variables');
}

export const env = {
  API_URL: apiUrl,
} as const;
