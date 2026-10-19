import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const mainRoot = fileURLToPath(new URL('..', import.meta.url));
const candidateRoot = resolve(mainRoot, '..', 'HRIS-Candidate-v2');

export const figmaSource = Object.freeze({
  file_key: 'XEXLe9J1oATlITS9I5u1P9',
  source: 'https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9',
  frames: [
    { node: '3:39433', page: 'Employee personal dashboard', current_capture: 'docs/evidence/employee-dashboard-desktop-20261012.png' },
    { node: '9:22640', page: 'Managerial dashboard', current_capture: 'docs/evidence/managerial-dashboard-desktop-20261015.png' },
    { node: '17:28320', page: 'Attendance information', current_capture: 'docs/evidence/attendance-information-desktop-20261016.png' },
    { node: '3:39880', page: 'Personal leave', current_capture: 'docs/evidence/personal-leave-desktop-20261012.png' },
  ],
});

function pngDimensions(path) {
  const head = readFileSync(path).subarray(0, 24);
  if (head.length !== 24 || head.toString('hex', 0, 8) !== '89504e470d0a1a0a') throw new Error(`Invalid PNG evidence: ${path}`);
  return { width: head.readUInt32BE(16), height: head.readUInt32BE(20) };
}

export function inspectDesignFoundation({ main = mainRoot, candidate = candidateRoot } = {}) {
  const mainCss = readFileSync(join(main, 'src/index.css'), 'utf8');
  const mainHtml = readFileSync(join(main, 'index.html'), 'utf8');
  const candidateCss = readFileSync(join(candidate, 'src/index.css'), 'utf8');
  const candidateApp = readFileSync(join(candidate, 'src/App.tsx'), 'utf8');
  const mainShell = readFileSync(join(main, 'src/App.tsx'), 'utf8');
  const mainLive = readFileSync(join(main, 'src/live/LiveApp.tsx'), 'utf8');
  const checks = {
    main_poppins_css: /--font-sans:\s*'Poppins'/.test(mainCss),
    main_poppins_loaded: /fonts\.googleapis\.com\/css2\?[^"\n]*Poppins/.test(mainHtml),
    main_approved_blue: /--color-brand-primary:\s*#085587/i.test(mainCss),
    candidate_poppins_css: /--font-sans:\s*'Poppins'/.test(candidateCss),
    candidate_approved_blue: /--color-synesis-800:\s*#085587/i.test(candidateCss),
    candidate_bengali_font_fallback: /:lang\(bn\)[\s\S]*?'Noto Sans Bengali'/.test(candidateCss),
    main_live_entry_preserved: /<LiveApp preview=/.test(mainShell),
    main_preview_requires_opt_in: /import\.meta\.env\.DEV\s*\|\|\s*import\.meta\.env\.VITE_ENABLE_DEMO_PREVIEW\s*===\s*'true'/.test(mainLive),
    candidate_public_only_release_gate: /import\.meta\.env\.PROD\s*&&\s*import\.meta\.env\.VITE_CANDIDATE_PUBLIC_ONLY\s*===\s*'true'/.test(candidateApp),
    tracked_figma_attendance_sort_asset: existsSync(join(main, 'src/assets/attendance-team-sort.svg')),
  };
  const captures = figmaSource.frames.map(frame => ({
    ...frame,
    dimensions: pngDimensions(join(main, frame.current_capture)),
    parity_status: 'NOT_CERTIFIED',
  }));
  return {
    foundation_checks: checks,
    foundation_passed: Object.values(checks).every(Boolean),
    figma_file_key: figmaSource.file_key,
    figma_frame_count: captures.length,
    captured_main_routes: captures,
    source_missing_dedicated_candidate_frame: true,
    source_missing_dedicated_super_admin_frame: true,
    full_visual_parity_certified: false,
    scope: 'Foundation and stored-screenshot integrity; not Figma pixel parity, live Auth, or WCAG certification.',
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = inspectDesignFoundation();
  if (process.argv.includes('--json')) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  else {
    const passed = Object.values(result.foundation_checks).filter(Boolean).length;
    process.stdout.write(`Phase 02 foundation: ${passed}/${Object.keys(result.foundation_checks).length} source/token/guard checks PASS.\n`);
    process.stdout.write(`${result.figma_frame_count} anchored Figma screen references have existing PNG captures; exact pixel parity remains NOT CERTIFIED.\n`);
    process.stdout.write('Candidate and platform Super Admin have no dedicated frames in the recovered Figma file.\n');
  }
  if (!result.foundation_passed) process.exitCode = 1;
}
