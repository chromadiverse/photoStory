"use client"

import { useRef, useEffect } from "react"
import Uppy from "@uppy/core"
import type { UppyFile } from "@uppy/core"
import AwsS3 from "@uppy/aws-s3"
import "@uppy/core/dist/style.css"

interface ImageUploaderProps {
  imageBlob: Blob
  bucketName: string
  folderName: string
  onUploadComplete: (uploadedFile: {
    name: string
    path: string
    type: string
  }) => void
  onUploadError?: (error: Error) => void
}

export default function ImageUploader({
  imageBlob,
  bucketName,
  folderName,
  onUploadComplete,
  onUploadError,
}: ImageUploaderProps) {
  const uppyRef = useRef<Uppy | null>(null)

  useEffect(() => {
    if (!uppyRef.current) {
      uppyRef.current = new Uppy({
        autoProceed: true,
        restrictions: {
          maxNumberOfFiles: 1,
          allowedFileTypes: ["image/*"],
        },
      })

      uppyRef.current.use(AwsS3, {
        async getUploadParameters(file: any) {
          const response = await fetch("/api/aws", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              bucketName,
              folderName,
              fileType: file.type,
            }),
          })

          if (!response.ok) {
            throw new Error("Failed to get signed URL")
          }

          const { signedUrl, uniqueFileName } = await response.json()
          
          // Add the uniqueFileName to the file's meta
          if (uppyRef.current) {
            uppyRef.current.setFileMeta(file.id, {
              ...file.meta,
              uniqueFileName
            })
          }

          return {
            method: "PUT",
            url: signedUrl,
            fields: {},
            headers: {
              "Content-Type": file.type || "image/jpeg",
            },
          }
        },
      } as any)

      uppyRef.current.on("complete", (result) => {
        if (result.successful && result.successful.length > 0) {
          const file = result.successful[0]
          onUploadComplete({
            name: file.name || "", // Add fallback for name
            path: (file.meta.uniqueFileName as string) || "", 
            type: file.type || "image/jpeg",
          })
        }
      })

      uppyRef.current.on("error", (error) => {
        console.error("Upload error:", error)
        onUploadError?.(error)
      })
    }

    return () => {
      uppyRef.current?.removeFiles?.(uppyRef.current.getFiles().map(f => f.id)) // Use removeFiles instead
    }
  }, [bucketName, folderName, onUploadComplete, onUploadError])

  // Start upload when component mounts with the blob
  useEffect(() => {
    if (uppyRef.current && imageBlob) {
      const file = new File([imageBlob], `photo-${Date.now()}.jpg`, {
        type: "image/jpeg",
      })

      try {
        uppyRef.current.addFile({
          name: file.name,
          type: file.type,
          data: file,
        })
      } catch (error) {
        console.error("Error adding file to Uppy:", error)
      }
    }
  }, [imageBlob])

  return null // This component doesn't render anything visible
}