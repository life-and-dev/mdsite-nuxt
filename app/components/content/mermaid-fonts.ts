interface DocumentFonts {
  fonts?: {
    ready?: PromiseLike<unknown>
  }
}

export async function runAfterDocumentFontsReady(
  documentValue: DocumentFonts,
  render: () => Promise<void>
): Promise<void> {
  try {
    await documentValue.fonts?.ready
  } catch {
    // Font readiness is an optimization; rendering must continue if it fails.
  }

  await render()
}
