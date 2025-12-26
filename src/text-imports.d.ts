// Type declarations for Bun's text imports using `with { type: 'text' }`
declare module '*.template' {
  const content: string
  export default content
}
