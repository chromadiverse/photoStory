import { NextRequest, NextResponse } from "next/server";
import { S3Client, ListBucketsCommand, PutObjectCommand } from "@aws-sdk/client-s3";

export async function GET(request: NextRequest) {
  const results: any = {
    envVars: {
      hasAccessKey: !!process.env.AWS_ACCESS_KEY_ID,
      accessKeyPrefix: process.env.AWS_ACCESS_KEY_ID ? process.env.AWS_ACCESS_KEY_ID.substring(0, 15) + "..." : null,
      hasSecretKey: !!process.env.AWS_SECRET_ACCESS_KEY,
      secretKeyPrefix: process.env.AWS_SECRET_ACCESS_KEY ? process.env.AWS_SECRET_ACCESS_KEY.substring(0, 15) + "..." : null,
      hasEndpoint: !!process.env.S3_ENDPOINT,
      endpoint: process.env.S3_ENDPOINT,
    }
  };

  const client = new S3Client({
    region: "auto",
    endpoint: process.env.S3_ENDPOINT,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
  });

  try {
    // Probar listar buckets (requiere permisos de listar)
    const listCommand = new ListBucketsCommand({});
    const listResponse = await client.send(listCommand);
    results.listBuckets = {
      success: true,
      buckets: listResponse.Buckets?.map(b => b.Name) || []
    };
  } catch (error: any) {
    results.listBuckets = {
      success: false,
      errorCode: error?.Code,
      errorMessage: error?.message
    };
  }

  // También probar generar una URL firmada para un test
  try {
    const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    
    const putCommand = new PutObjectCommand({
      Bucket: "im-g",
      Key: `test-${Date.now()}.txt`,
      ContentType: "text/plain",
    });
    
    const signedUrl = await getSignedUrl(client, putCommand, { expiresIn: 60 });
    results.signUrl = {
      success: true,
      urlPrefix: signedUrl.substring(0, 100) + "..."
    };
  } catch (error: any) {
    results.signUrl = {
      success: false,
      errorMessage: error?.message
    };
  }

  return NextResponse.json(results);
}