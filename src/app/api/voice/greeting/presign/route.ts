import { NextRequest, NextResponse } from 'next/server';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// POST /api/voice/greeting/presign
// Generate presigned URL for direct upload to R2
export async function POST(request: NextRequest) {
  const { filename, contentType } = await request.json();

  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET_NAME;
  const publicUrl = process.env.R2_PUBLIC_URL;

  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
    return NextResponse.json({ error: 'R2 storage not configured' }, { status: 500 });
  }

  const ext = filename?.split('.').pop() || 'wav';
  const key = `call-greetings/fwt-${Date.now()}-greeting.${ext}`;

  const s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType || 'audio/mpeg',
  });

  const presignedUrl = await getSignedUrl(s3, command, { expiresIn: 300 });

  return NextResponse.json({
    presignedUrl,
    publicUrl: `${publicUrl}/${key}`,
    r2Key: key,
  });
}
