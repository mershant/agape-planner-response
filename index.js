import { generationInterceptor, initialize } from './src/runtime.mjs';

globalThis.agapePlannerResponseInterceptor = generationInterceptor;

jQuery(async () => {
  try {
    await initialize();
  } catch (error) {
    console.error('[AGAPE Planner Response] Initialization failed.', error);
    globalThis.toastr?.error(error.message || String(error), 'Planner Response');
  }
});
