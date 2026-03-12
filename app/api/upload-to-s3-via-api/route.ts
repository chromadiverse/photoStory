// File: app/api/upload-to-s3-via-api/route.ts
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const bucketName = formData.get("bucketName") as string | null;
    const folderName = formData.get("folderName") as string | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    if (!bucketName) {
      return NextResponse.json({ error: "No bucket name provided" }, { status: 400 });
    }

    const fileBuffer = await file.arrayBuffer();
    const fileBufferTyped = new Uint8Array(fileBuffer);

    // FIX: VERCEL_URL is always set automatically by Vercel on every deployment.
    // NEXT_PUBLIC_BASE_URL is checked first (your custom override), then VERCEL_URL
    // (auto-set by Vercel, needs https:// prepended), then localhost as a final fallback.
    // The old code only checked NEXT_PUBLIC_BASE_URL which was often undefined on Vercel,
    // causing the internal fetch to silently hang and leave isUploading stuck.
    const baseUrl =
      process.env.NEXT_PUBLIC_BASE_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ||
      `http://localhost:${process.env.PORT || 3000}`;

    const awsApiUrl = `${baseUrl}/api/aws`;

    const signedUrlResponse = await fetch(awsApiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        bucketName,
        folderName,
        fileType: file.type,
      }),
    });

    if (!signedUrlResponse.ok) {
      const errorText = await signedUrlResponse.text();
      console.error("Error calling /api/aws:", errorText);
      return NextResponse.json({ error: `Failed to get signed URL: ${errorText}` }, { status: 500 });
    }

    const { signedUrl, uniqueFileName } = await signedUrlResponse.json();

    if (!signedUrl || !uniqueFileName) {
      return NextResponse.json({ error: "Missing signed URL or uniqueFileName from /api/aws" }, { status: 500 });
    }

    const uploadResponse = await fetch(signedUrl, {
      method: "PUT",
      body: fileBufferTyped,
      headers: {
        "Content-Type": file.type,
      },
    });

    if (!uploadResponse.ok) {
      console.error(`S3-compatible upload failed: ${uploadResponse.status} - ${uploadResponse.statusText}`);
      return NextResponse.json({ error: `S3 upload failed: ${uploadResponse.statusText}` }, { status: uploadResponse.status });
    }

    return NextResponse.json({ path: uniqueFileName });

  } catch (error) {
    console.error("API Route Error (PWA):", error);
    return NextResponse.json({ error: "Internal Server Error (PWA)" }, { status: 500 });
  }
}