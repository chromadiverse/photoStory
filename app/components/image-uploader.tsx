"use client";

import { useRef, useEffect } from "react";
import Uppy from "@uppy/core";
import type { UppyFile } from "@uppy/core";
import XHRUpload from "@uppy/xhr-upload"; // Use XHRUpload

interface ImageUploaderProps {
  imageBlob: Blob;
  bucketName: string;
  folderName: string;
  onUploadComplete: (uploadedFile: {
    name: string;
    path: string; // This will come from your API response
    type: string;
  }) => void;
  onUploadError?: (error: Error) => void;
}

// Define types for the XHRUpload response if needed, though Body is usually sufficient
// type MyResponseBody = { path: string; [key: string]: any }; // Example

export default function ImageUploader({
  imageBlob,
  bucketName,
  folderName,
  onUploadComplete,
  onUploadError,
}: ImageUploaderProps) {
  const uppyRef = useRef<Uppy | null>(null);

  useEffect(() => {
    if (!uppyRef.current) {
      uppyRef.current = new Uppy({
        id: "image-uploader-pwa",
        autoProceed: true,
        restrictions: {
          maxNumberOfFiles: 1,
          allowedFileTypes: ["image/*"],
        },
        debug: true, // Keep for debugging
      });

      // Use XHRUpload to call your API route which handles S3 interaction
      uppyRef.current.use(XHRUpload, {
        endpoint: "/api/upload-to-s3-via-api", // Create this new API route
        method: "post",
        headers: {
          // Add any necessary headers here if your API route requires them
          // e.g., 'Authorization': `Bearer ${token}`,
        },
        formData: true,
        fieldName: "file",
        // --- CORRECTED getResponseData ---
        getResponseData: (xhr: XMLHttpRequest) => {
          // xhr.response is usually the parsed JSON body if the server returns JSON and sets the correct Content-Type
          // xhr.responseText is the raw text response
          // Choose based on your API's response and how you want to handle it
          // Assuming your API returns JSON like { path: "..." }
          try {
             // If xhr.response is already parsed JSON, use it directly
             if (xhr.response && typeof xhr.response === 'object') {
                 console.log("XHRUpload Response Data (PWA) - xhr.response:", xhr.response);
                 return xhr.response; // Return the parsed object
             }
             // Fallback: parse responseText if xhr.response is not an object
             const data = JSON.parse(xhr.responseText);
             console.log("XHRUpload Response Data (PWA) - xhr.responseText:", data);
             return data;
          } catch (e: any) { // Explicitly type the catch parameter
            console.error("Could not parse response as JSON (PWA):", xhr.responseText, e);
            // Return an empty object or a default structure if parsing fails
            return {}; // Or return { error: "Could not parse response" };
          }
        },
        // --- CORRECTED getResponseError ---
        getResponseError: (xhr: XMLHttpRequest) => {
          // xhr.status contains the HTTP status code
          // xhr.response or xhr.responseText contains the response body
          const status = xhr.status;
          const responseText = xhr.responseText; // Or xhr.response if it's parsed JSON

          try {
            // Attempt to parse the error response as JSON
            const data = JSON.parse(responseText);
            // If the server sends a JSON error object like { error: "message" }
            return new Error(data.error || `Upload failed with status ${status}`);
          } catch (e: any) { // Explicitly type the catch parameter
            // If parsing fails, return an error with the status and raw response text
            return new Error(`Upload failed with status ${status}: ${responseText}`);
          }
        },
        // Optional: Handle successful response codes if different from default (200-299)
        // validateStatus: (xhr: XMLHttpRequest) => {
        //   // Return true if the status code indicates success
        //   return (xhr.status >= 200 && xhr.status < 300) || xhr.status === 201; // Example for 201 Created
        // }
      } as any); // Use type assertion as a temporary workaround if needed, but try the above first

      uppyRef.current.on("upload", () => {
        console.log("PWA Upload started");
      });

      uppyRef.current.on("progress", (progress: number) => { // 'progress' is a number (percentage)
        console.log(`PWA Upload progress: ${progress}%`); // Access the number directly
      });

      uppyRef.current.on("complete", (result) => {
        console.log("PWA Upload complete:", result);

        if (result.successful && result.successful.length > 0) {
          const file = result.successful[0];
          // The response data from getResponseData should now be available in file.response.body
          const response = file.response?.body || {};
          console.log("Parsed response body (PWA):", response);

          if (response.path) { // Assuming your new API returns the path
            onUploadComplete({
              name: file.name || `upload-${Date.now()}.jpg`,
              path: response.path, // Use path from API response
              type: file.type || "image/jpeg",
            });
          } else {
            const error = new Error("Upload succeeded but path was not returned from server (PWA).");
            console.error("PWA Upload completion error:", error);
            onUploadError?.(error);
          }
        } else {
          if (result.failed && result.failed.length > 0) {
            // --- CORRECTED: Ensure firstError is an Error object ---
            const rawError = result.failed[0].error;
            let firstError: Error;
            if (typeof rawError === 'string') {
              firstError = new Error(rawError);
            // --- FIXED: Handle instanceof Error with type assertion ---
            } else if (rawError != null && typeof rawError === 'object') {
              // Type assertion to treat rawError as an object for the instanceof check
              const rawErrorAsObject = rawError as object;
              if (Error.prototype.isPrototypeOf(rawErrorAsObject)) { // Use isPrototypeOf
                 firstError = rawErrorAsObject as Error; // Type assertion after check
              } else {
                 firstError = new Error("Upload failed (PWA) - Unknown error object type.");
              }
            } else {
              firstError = new Error("Upload failed (PWA)."); // Fallback
            }
            console.error("PWA Upload completion error (failed files):", firstError);
            onUploadError?.(firstError); // Now passing an Error object
          } else {
            // This case might happen if the upload process completed but no files were marked successful
            // or failed, perhaps due to validation or other issues.
            // The result might have other info, but typically one of the above arrays will have entries.
            // You might want to log more details from 'result' here for debugging.
            console.log("PWA Upload completed, but no successful or failed files reported. Result:", result);
            const error = new Error("Upload process completed but no status reported (PWA).");
            console.error("PWA Upload completion error (no status):", error);
            onUploadError?.(error);
          }
        }
      });

      uppyRef.current.on("error", (error) => {
        console.error("Uppy general error (PWA):", error);
        // --- CORRECTED: Ensure error is an Error object ---
        if (typeof error === 'string') {
          onUploadError?.(new Error(error)); // Convert string to Error
        // --- FIXED: Handle instanceof Error with type assertion ---
        } else if (error != null && typeof error === 'object') {
            const errorAsObject = error as object;
            if (Error.prototype.isPrototypeOf(errorAsObject)) {
                 onUploadError?.(errorAsObject as Error); // Pass Error object directly
            } else {
                 onUploadError?.(new Error(`Unknown error: ${error}`)); // Fallback
            }
        } else {
          // Fallback if error is neither string nor Error object
          onUploadError?.(new Error(`Unknown error: ${error}`));
        }
      });

      uppyRef.current.on("upload-error", (file, error, uploadResponse) => { // Corrected parameter name
        // uploadResponse contains details about the failed upload attempt
        console.error("Upload error for file (PWA):", file?.name, { error, uploadResponse });
        // --- CORRECTED: Ensure error is an Error object ---
        if (typeof error === 'string') {
          onUploadError?.(new Error(error)); // Convert string to Error
        // --- FIXED: Handle instanceof Error with type assertion ---
        } else if (error != null && typeof error === 'object') {
            const errorAsObject = error as object;
            if (Error.prototype.isPrototypeOf(errorAsObject)) {
                 onUploadError?.(errorAsObject as Error); // Pass Error object directly
            } else {
                 onUploadError?.(new Error(`Upload error: ${error}`)); // Fallback
            }
        } else {
          // Fallback if error is neither string nor Error object
          onUploadError?.(new Error(`Upload error: ${error}`));
        }
      });

      uppyRef.current.on("restriction-failed", (file, error) => {
        console.error("File restriction failed (PWA):", file?.name, error);
        // --- CORRECTED: Ensure error is an Error object ---
        if (typeof error === 'string') {
          onUploadError?.(new Error(error)); // Convert string to Error
        // --- FIXED: Handle instanceof Error with type assertion ---
        } else if (error != null && typeof error === 'object') {
            const errorAsObject = error as object;
            if (Error.prototype.isPrototypeOf(errorAsObject)) {
                 onUploadError?.(errorAsObject as Error); // Pass Error object directly
            } else {
                 onUploadError?.(new Error(`Restriction failed: ${error}`)); // Fallback
            }
        } else {
          // Fallback if error is neither string nor Error object
          onUploadError?.(new Error(`Restriction failed: ${error}`));
        }
      });
    }

    return () => {
      if (uppyRef.current) {
        const files = uppyRef.current.getFiles();
        if (files.length > 0) {
          uppyRef.current.removeFiles(files.map((f) => f.id));
        }
        // --- REMOVED: uppyRef.current.close({ reason: "unmount" }).catch(...) ---
        // Uppy instance cleanup might not require an explicit close call in React useEffect cleanup
        // Relying on garbage collection after clearing files.
      }
    };
  }, [bucketName, folderName, onUploadComplete, onUploadError]);

  // Start upload when component mounts with the blob
  useEffect(() => {
    if (uppyRef.current && imageBlob) {
      const existingFiles = uppyRef.current.getFiles();
      if (existingFiles.length > 0) {
        uppyRef.current.removeFiles(existingFiles.map((f) => f.id));
      }

      const file = new File([imageBlob], `photo-${Date.now()}.jpg`, {
        type: "image/jpeg",
      });

      try {
        uppyRef.current.addFile({
          name: file.name,
          type: file.type,
          data: file, // --- CORRECTED: Use 'data' property ---
          // Pass necessary data as meta for your API route
          meta: { bucketName, folderName },
        });
        console.log("File added to Uppy (PWA):", file.name);
      } catch (error) {
        console.error("Error adding file to Uppy (PWA):", error);
        onUploadError?.(error as Error);
      }
    }
  }, [imageBlob, bucketName, folderName, onUploadError]);

  return null;
}