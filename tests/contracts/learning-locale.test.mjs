import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const localeFile = readFileSync(new URL('../../src/live/learning-locale.ts', import.meta.url), 'utf8');
const workspace = readFileSync(new URL('../../src/live/LiveHrisWorkspace.tsx', import.meta.url), 'utf8');
const files = ['MyLearning.tsx', 'LearningProgramAdmin.tsx', 'LearningRequests.tsx', 'LearningCompletionQueue.tsx'];
const components = Object.fromEntries(files.map(file => [file,
  readFileSync(new URL(`../../src/live/${file}`, import.meta.url), 'utf8')]));

test('learning locale catalog has unique Bengali translations for every literal tx key', () => {
  const entries = [...localeFile.matchAll(/^\s*'((?:[^'\\]|\\.)*)'\s*:\s*'((?:[^'\\]|\\.)*)',?\s*$/gm)];
  const translations = new Map(entries.map(([, key, value]) => [key.replaceAll("\\'", "'"), value]));
  assert.ok(translations.size > 150, 'expected the employee and manager learning journeys to have broad translation coverage');
  assert.equal(translations.size, entries.length, 'translation keys must be unique');
  for (const [file, source] of Object.entries(components)) {
    const keys = [...source.matchAll(/\btx\(\s*'((?:[^'\\]|\\.)*)'/g)].map(([, key]) => key.replaceAll("\\'", "'"));
    for (const key of keys) assert.ok(translations.has(key), `${file} uses untranslated key: ${key}`);
  }
  for (const key of ['My Learning', 'Learning programs', 'Learning requests', 'Learning completion review', 'Your skill profile', 'No learning requests waiting']) {
    assert.ok(translations.get(key)?.length > 0, `missing Bengali UI translation for ${key}`);
    assert.notEqual(translations.get(key), key, `${key} is only copied in English`);
  }
});

test('employee, program manager, and request manager pages receive the active locale', () => {
  assert.match(workspace, /<MyLearning tenantId=\{tenantId\} locale=\{locale\} \/>/);
  assert.match(workspace, /<LearningProgramAdmin tenantId=\{tenantId\} locale=\{locale\} \/>/);
  assert.match(workspace, /<LearningRequests tenantId=\{tenantId\} locale=\{locale\} \/>/);
  assert.match(workspace, /<LearningCompletionQueue tenantId=\{tenantId\} locale=\{locale\} \/>/);
  for (const [file, source] of Object.entries(components)) {
    assert.match(source, /type \{ Locale \} from '\.\/project-locale'/, `${file} must use the shared locale type`);
    assert.match(source, /locale === 'bn' \? 'bn-BD' : 'en-US'/, `${file} dates must follow the selected locale`);
  }
});
