import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const bucketName = formData.get("bucketName") as string | null;
    const folderName = formData.get("folderName") as string | null;

    console.log("=== /api/upload-to-s3-via-api CALLED ===")
    console.log("bucketName:", bucketName)
    console.log("folderName:", folderName)
    console.log("file name:", file?.name)
    console.log("file type:", file?.type)
    console.log("file size:", file?.size)

    const isDebug = request.headers.get("x-debug") === "true" || request.nextUrl.searchParams.get("debug") === "true";
    
    if (isDebug) {
      const allKeys: string[] = []
      formData.forEach((_, key) => allKeys.push(key))
      return NextResponse.json({ 
        debug: true,
        receivedKeys: allKeys,
        hasFile: !!file,
        bucketName,
        folderName,
        fileName: file?.name,
        fileSize: file?.size,
      })
    }

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    if (!bucketName) {
      return NextResponse.json({ error: "No bucket name provided" }, { status: 400 });
    }

    const fileBuffer = await file.arrayBuffer();
    const fileBufferTyped = new Uint8Array(fileBuffer);

    const baseUrl =
      process.env.NEXT_PUBLIC_BASE_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ||
      `http://localhost:${process.env.PORT || 3000}`;

    const awsApiUrl = `${baseUrl}/api/aws`;

    console.log("=== CALLING /api/aws ===")
    console.log("awsApiUrl:", awsApiUrl)

    const signedUrlResponse = await fetch(awsApiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bucketName, folderName, fileType: file.type }),
    });

    if (!signedUrlResponse.ok) {
      const errorText = await signedUrlResponse.text();
      console.error("=== /api/aws FAILED ===")
      console.error("Status:", signedUrlResponse.status)
      console.error("Error:", errorText)
      return NextResponse.json({ error: `Failed to get signed URL: ${errorText}` }, { status: 500 });
    }

    const { signedUrl, uniqueFileName } = await signedUrlResponse.json();

    console.log("=== SIGNED URL RECEIVED ===")
    console.log("signedUrl:", signedUrl)
    console.log("uniqueFileName:", uniqueFileName)

    if (!signedUrl || !uniqueFileName) {
      return NextResponse.json({ error: "Missing signed URL or uniqueFileName from /api/aws" }, { status: 500 });
    }

    console.log("=== UPLOADING TO R2 ===")
    console.log("file type being sent:", file.type)

    const uploadResponse = await fetch(signedUrl, {
      method: "PUT",
      body: fileBufferTyped,
      headers: { "Content-Type": file.type },
    });

    if (!uploadResponse.ok) {
      const errorBody = await uploadResponse.text();
      console.error("=== R2 UPLOAD FAILED ===")
      console.error("Status:", uploadResponse.status)
      console.error("StatusText:", uploadResponse.statusText)
      console.error("R2 Error XML:", errorBody)
      return NextResponse.json({ error: `S3 upload failed: ${errorBody}` }, { status: uploadResponse.status });
    }

    console.log("=== R2 UPLOAD SUCCESS ===")
    console.log("path:", uniqueFileName)
    return NextResponse.json({ path: uniqueFileName });

  } catch (error) {
    console.error("=== API Route Error (PWA) ===", error);
    return NextResponse.json({ error: "Internal Server Error (PWA)" }, { status: 500 });
  }
}