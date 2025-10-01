declare module '@uppy/core/dist/style.css' {
  const content: any
  export default content
}

declare module '@uppy/dashboard/dist/style.css' {
  const content: any
  export default content
}

// Add other Uppy CSS modules if you use them
declare module '@uppy/**/dist/style.css' {
  const content: any
  export default content
}