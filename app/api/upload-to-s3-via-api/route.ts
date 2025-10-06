// File: pages/api/upload-to-s3-via-api.ts OR app/api/upload-to-s3-via-api/route.ts
import { NextRequest, NextResponse } from "next/server"; // For App Router
// import type { NextApiRequest, NextApiResponse } from 'next'; // For Pages Router

// For App Router:
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

    // Read the file content
    const fileBuffer = await file.arrayBuffer();
    const fileBufferTyped = new Uint8Array(fileBuffer);

    // Call your existing /api/aws endpoint to get the signed URL and uniqueFileName
    const signedUrlResponse = await fetch("/api/aws", { // This calls your internal route
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

    // Now, upload the file directly to the S3-compatible service using the signed URL
    const uploadResponse = await fetch(signedUrl, {
      method: "PUT", // S3 expects PUT for signed URL uploads
      body: fileBufferTyped, // Send the raw file data
      headers: {
        "Content-Type": file.type, // Ensure correct content type is sent
        // Do NOT include Authorization header here, as the URL is pre-signed
      },
    });

    if (!uploadResponse.ok) {
      console.error(`S3-compatible upload failed: ${uploadResponse.status} - ${uploadResponse.statusText}`);
      return NextResponse.json({ error: `S3 upload failed: ${uploadResponse.statusText}` }, { status: uploadResponse.status });
    }

    // If the PUT request to the signed URL was successful, the file is uploaded.
    // Return the uniqueFileName to the frontend
    return NextResponse.json({ path: uniqueFileName }); // Consistent with XHRUpload expectation

  } catch (error) {
    console.error("API Route Error (PWA):", error);
    return NextResponse.json({ error: "Internal Server Error (PWA)" }, { status: 500 });
  }
}

// For Pages Router, the structure would be slightly different:
// export default async function handler(req: NextApiRequest, res: NextApiResponse) {
//   // Similar logic inside, but using req.body, req.file, and res.status().json()
//   // You'd need to handle multipart form data parsing differently (e.g., using 'busboy' or 'formidable')
// }