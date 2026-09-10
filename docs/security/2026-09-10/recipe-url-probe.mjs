import { validateRecipe } from '../../../src/lib/recipe.js';
for (const input of [
  { wxrUrl: 'https://demo:synthetic-password@example.com/import.xml' },
  { phpExtensionManifestUrl: 'https://example.com/manifest.json?token=synthetic-token' },
  { landingPage: '//example.com/path' },
  { landingPage: '/\\example.com/path' },
]) {
  const recipe = validateRecipe({ name: 'Security probe', ...input });
  console.log(JSON.stringify({ input, accepted: Object.fromEntries(Object.keys(input).map(key => [key, recipe[key]])) }));
}
