export async function runModelAssessment(input) {
  // Later this can call Claude, Llama, or another model endpoint.
  // The rest of the app expects the model to return the same report shape.
  throw new Error(`No live model adapter configured for ${input.mode}.`);
}
