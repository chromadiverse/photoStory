// File: app/api/upload-to-s3-via-api/route.ts
import { NextRequest, NextResponse } from "next/server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

// FIX: Initialize S3 client directly here instead of making an internal fetch
// to /api/aws. The internal fetch was fragile — NEXT_PUBLIC_BASE_URL is often
// undefined on Vercel, causing the signed URL request to silently fail or hang,
// which left isUploading stuck as true on the frontend.
const s3Client = new S3Client({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
  // If you're using a custom S3-compatible endpoint (e.g. Supabase Storage, Cloudflare R2, Backblaze):
  // endpoint: process.env.AWS_S3_ENDPOINT,
  // forcePathStyle: true, // needed for some S3-compatible services
});

const BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME || process.env.NEXT_PUBLIC_IMAGE_GALLERY_BUCKET || "gallery";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const folderName = (formData.get("folderName") as string | null) || "im-g";

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Validate file size (10MB limit)
    const MAX_FILE_SIZE = 10 * 1024 * 1024;
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "File too large. Maximum size is 10MB." }, { status: 400 });
    }

    // Read the file content
    const fileBuffer = await file.arrayBuffer();
    const fileBufferTyped = new Uint8Array(fileBuffer);

    // Generate a unique filename (mirrors what /api/aws was doing)
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const extension = file.type === "image/png" ? "png" : "jpg";
    const uniqueFileName = `${folderName}/${timestamp}-${randomSuffix}.${extension}`;

    console.log(`[upload-to-s3] Uploading file: ${uniqueFileName}, size: ${file.size}, type: ${file.type}`);

    // FIX: Upload directly to S3 using the SDK — no internal fetch needed
    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: uniqueFileName,
      Body: fileBufferTyped,
      ContentType: file.type,
    });

    await s3Client.send(command);

    console.log(`[upload-to-s3] Upload successful: ${uniqueFileName}`);

    // Return the path — consistent with what the frontend expects
    return NextResponse.json({ path: uniqueFileName });

  } catch (error: any) {
    console.error("[upload-to-s3] Error:", error);

    // Surface a clearer error for AWS credential/config issues
    if (error?.name === "CredentialsProviderError" || error?.Code === "InvalidAccessKeyId") {
      return NextResponse.json(
        { error: "AWS credentials not configured correctly" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: error?.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}