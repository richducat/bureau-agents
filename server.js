import('./server-dist/start.js').catch((error) => {
  console.error('Bureau API failed to start:', error instanceof Error ? error.message : 'unknown error')
  process.exit(1)
})
