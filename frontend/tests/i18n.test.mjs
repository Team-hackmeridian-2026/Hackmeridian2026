import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createInstance } from 'i18next';

const resources = Object.fromEntries(await Promise.all(['en', 'fr', 'pt'].map(async language => [
  language, { translation: JSON.parse(await readFile(new URL(`../src/i18n/${language}.json`, import.meta.url), 'utf8')) },
])));
const flatten = (object, prefix = '') => Object.fromEntries(Object.entries(object).flatMap(([key, value]) => typeof value === 'string' ? [[prefix + key, value]] : Object.entries(flatten(value, prefix + key + '.'))));
const placeholders = text => [...text.matchAll(/{{\s*([^}]+)\s*}}/g)].map(match => match[1].trim()).sort();

for (const language of ['fr', 'pt']) {
  test(`${language} includes every English key and preserves interpolation`, () => {
    const source = flatten(resources.en.translation);
    const target = flatten(resources[language].translation);
    assert.deepEqual(Object.keys(target).sort(), Object.keys(source).sort());
    for (const [key, value] of Object.entries(source)) {
      assert.ok(target[key].trim(), `${key} must not be empty`);
      assert.deepEqual(placeholders(target[key]), placeholders(value), key);
    }
  });
}

test('all languages resolve plurals and preserve interpolated chain data', async () => {
  const i18n = createInstance();
  await i18n.init({ resources, fallbackLng: 'en', interpolation: { escapeValue: false } });
  for (const language of ['en', 'fr', 'pt']) {
    await i18n.changeLanguage(language);
    for (const count of [1, 2]) {
      const duration = i18n.t('common.years', { count });
      const text = i18n.t('marketplace.licenceLine', { licence: 'IP-NFT', territory: 'EURC / SEP-24', duration });
      assert.notEqual(duration, 'common.years');
      assert.ok(text.includes('IP-NFT') && text.includes('EURC / SEP-24') && text.includes(String(count)));
      assert.ok(!text.includes('{{'));
    }
  }
});
