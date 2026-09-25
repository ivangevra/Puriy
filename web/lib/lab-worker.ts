import { evaluateStudy, frequencyAlternatives } from './lab-engine';
import type { EvaluationInput } from './lab-types';
self.onmessage = (
  event: MessageEvent<{ input: EvaluationInput; alternatives: boolean }>,
) => {
  try {
    const result = evaluateStudy(event.data.input, (n) =>
      self.postMessage({ type: 'progress', value: n }),
    );
    const options = event.data.alternatives
      ? frequencyAlternatives(event.data.input)
      : [];
    self.postMessage({ type: 'result', result, options });
  } catch (error) {
    self.postMessage({ type: 'error', message: (error as Error).message });
  }
};
