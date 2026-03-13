# UI v2 — Guided Header Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the two-column sidebar layout with a guided header (date → postcode → drive time), a horizontal chip bar for facility/weather filters, and a full-width results grid — all without touching any state or data-fetching logic.

**Architecture:** All changes are purely presentational. The JSX `return` block in `App.tsx` is rewritten; the ~1000 lines of state/hooks above it stay completely untouched. `index.css` gains new classes for the guided header, step blocks, and chips, while all existing card/weather/availability classes are preserved. No new dependencies.

**Tech Stack:** React 18, UnoCSS (utility classes), vanilla CSS custom properties, Vite.

---

## Task 1: Create the rollback branch and confirm tests pass

**Files:**
- No files modified

**Step 1: Create `ui-v2` branch from current main**

```bash
cd /Users/nicholasthorpe/Documents/Personal/hacks/MANGROVES_2023/campradar
git checkout -b ui-v2
```

Expected: `Switched to a new branch 'ui-v2'`

**Step 2: Run tests to confirm baseline passes**

```bash
npm run test
```

Expected: All tests pass. Note the count so you can confirm it stays the same throughout.

**Step 3: Commit the design doc (already created)**

```bash
git add docs/
git commit -m "docs: add UI v2 design and implementation plan"
```

---

## Task 2: Add new CSS classes to index.css

**Files:**
- Modify: `src/index.css` (append to end of file)

**Step 1: Append the new guided-header and chip-bar CSS**

Add the following at the very end of `src/index.css`:

```css
/* ============================================
   UI V2 — GUIDED HEADER
   ============================================ */

.guided-header {
  background: var(--color-sand, #f2eadc);
  padding: 2rem 2.5rem 2rem;
  border-bottom: 1px solid rgba(47, 94, 58, 0.12);
}

.guided-header__inner {
  max-width: 72rem;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 1.75rem;
}

.brand-lockup {
  display: flex;
  align-items: baseline;
  gap: 1rem;
  flex-wrap: wrap;
}

.brand-lockup__title {
  font-family: var(--font-display);
  font-size: 2.2rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  color: #1f2a24;
  line-height: 1;
}

.brand-lockup__tagline {
  font-size: 0.9rem;
  color: #4b5563;
  line-height: 1.5;
  max-width: 520px;
}

.steps-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 1rem;
  align-items: start;
}

.step {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.step__label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.step__number {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.4rem;
  height: 1.4rem;
  border-radius: 50%;
  background: #2f5e3a;
  color: #fff;
  font-size: 0.6rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  flex-shrink: 0;
}

.step__name {
  font-size: 0.6rem;
  font-weight: 700;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: #2f5e3a;
}

.step__prompt {
  font-size: 0.78rem;
  color: #4b5563;
  line-height: 1.4;
  min-height: 2.4em;
}

.step__input {
  width: 100%;
  border-radius: 0.5rem;
  border: 1.5px solid #d1d5db;
  background: #fff;
  padding: 0.6rem 0.85rem;
  font-size: 0.875rem;
  color: #1f2a24;
  outline: none;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
  font-family: var(--font-body);
}

.step__input:focus {
  border-color: #2f5e3a;
  box-shadow: 0 0 0 3px rgba(47, 94, 58, 0.15);
}

.step__input[readonly] {
  background: #f3f4f6;
  color: #9ca3af;
  cursor: not-allowed;
}

.step__error {
  font-size: 0.7rem;
  color: #c86b2a;
  font-weight: 500;
}

.step__hint {
  font-size: 0.7rem;
  color: #6b7280;
  line-height: 1.4;
}

.step__hint--warn {
  color: #b45309;
  font-weight: 500;
}

.step__dates {
  display: flex;
  gap: 0.5rem;
  align-items: start;
  flex-wrap: wrap;
}

.step__dates-group {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  flex: 1;
  min-width: 120px;
}

.step__dates-sublabel {
  font-size: 0.6rem;
  font-weight: 700;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: #6b7280;
}

.step__slider-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.step__slider {
  flex: 1;
  accent-color: #2f5e3a;
}

.step__slider-value {
  font-size: 0.875rem;
  font-weight: 600;
  color: #1f2a24;
  white-space: nowrap;
  min-width: 4rem;
  text-align: right;
}

/* ============================================
   UI V2 — CHIP BAR
   ============================================ */

.chip-bar {
  background: #fff;
  border-bottom: 1px solid #e5e7eb;
  padding: 0.75rem 2.5rem;
}

.chip-bar__inner {
  max-width: 72rem;
  margin: 0 auto;
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
}

.chip-bar__divider {
  width: 1px;
  height: 1.5rem;
  background: #e5e7eb;
  margin: 0 0.25rem;
  flex-shrink: 0;
}

.chip-bar__label {
  font-size: 0.6rem;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: #9ca3af;
  margin-right: 0.25rem;
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.35rem 0.75rem;
  border-radius: 999px;
  border: 1.5px solid #d1d5db;
  background: #fff;
  color: #374151;
  font-size: 0.78rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
  user-select: none;
  font-family: var(--font-body);
  white-space: nowrap;
}

.chip:hover {
  border-color: #2f5e3a;
  color: #2f5e3a;
}

.chip.is-active {
  background: #2f5e3a;
  border-color: #2f5e3a;
  color: #fff;
}

.chip:disabled,
.chip.is-disabled {
  opacity: 0.4;
  cursor: not-allowed;
  pointer-events: none;
}

.chip__icon {
  font-size: 0.9rem;
  line-height: 1;
}

/* ============================================
   UI V2 — RESULTS BAR
   ============================================ */

.results-bar {
  max-width: 72rem;
  margin: 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 0 0.5rem;
}

.results-bar__count {
  font-size: 0.875rem;
  font-weight: 600;
  color: #4b5563;
}

.results-bar__count strong {
  color: #1f2a24;
  font-size: 1rem;
}

/* ============================================
   UI V2 — MAIN CONTENT AREA
   ============================================ */

.content-area {
  padding: 0 2.5rem 4rem;
}

.content-area__inner {
  max-width: 72rem;
  margin: 0 auto;
}

@media (max-width: 768px) {
  .guided-header {
    padding: 1.25rem 1rem 1.25rem;
  }

  .chip-bar {
    padding: 0.65rem 1rem;
  }

  .content-area {
    padding: 0 1rem 3rem;
  }

  .steps-row {
    grid-template-columns: 1fr;
    gap: 1.25rem;
  }

  .brand-lockup__title {
    font-size: 1.7rem;
  }
}
```

**Step 2: Confirm the app still compiles**

```bash
npm run build
```

Expected: Build succeeds with no TypeScript errors.

**Step 3: Commit**

```bash
git add src/index.css
git commit -m "style: add UI v2 guided-header, chip-bar, and results-bar CSS classes"
```

---

## Task 3: Rewrite the JSX return — incident banner + guided header

**Files:**
- Modify: `src/App.tsx` — only the `return (...)` block (line ~1011 to end)

This is the biggest task. Do it in two sub-steps: header first, then chip bar + results.

**Step 1: Replace only the `return` opening through end of the `</header>` equivalent**

Find the current `return (` block. Replace from `return (` down to and including the closing `</header>` tag (around line 1158 in the original). Replace with:

```tsx
  return (
    <div className="min-h-screen text-ink">
      {/* ── Incident banner (unchanged) ── */}
      <div
        className="incident-banner incident-banner--egg px-6 py-3 text-sm font-semibold sm:px-10"
        style={{ background: '#f1c84b', color: '#2b2b2b' }}
      >
        <div className="mx-auto max-w-6xl">
          {incidentsUpdatedAt ? (
            <div className="mb-2 text-xs font-medium uppercase tracking-[0.15em] text-ink/70">
              Feed updated {new Date(incidentsUpdatedAt).toLocaleTimeString()}
            </div>
          ) : null}
          {incidents.length > 0 ? (
            <div className="incident-marquee">
              <div className="incident-track">
                {[...incidents, ...incidents].map((incident, index) => {
                  const showStatic = (index + 1) % 4 === 0
                  return (
                    <span key={`${incident.title}-${index}`} className="incident-item">
                      <a
                        href={incident.link || 'https://www.emergency.vic.gov.au'}
                        target="_blank"
                        rel="noreferrer"
                        className="incident-link"
                      >
                        {incident.title}
                      </a>
                      {incident.category ? (
                        <span className="incident-badge">{incident.category}</span>
                      ) : null}
                      {showStatic ? (
                        <span className="incident-static">
                          {staticIncidentText}{' '}
                          <a
                            href="https://www.emergency.vic.gov.au"
                            target="_blank"
                            rel="noreferrer"
                            className="incident-link"
                          >
                            Check VicEmergency
                          </a>
                        </span>
                      ) : null}
                    </span>
                  )
                })}
              </div>
            </div>
          ) : (
            <div className="text-xs font-semibold uppercase tracking-[0.15em]">
              {staticIncidentText}{' '}
              <a
                href="https://www.emergency.vic.gov.au"
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-4 transition hover:opacity-80"
              >
                Check VicEmergency
              </a>
              {incidentsError ? ` • ${incidentsError}` : ''}
            </div>
          )}
        </div>
      </div>

      {/* ── Guided header ── */}
      <div className="guided-header">
        <div className="guided-header__inner">
          {/* Brand */}
          <div className="brand-lockup">
            <div className="brand-lockup__title">CampCaster</div>
            <p className="brand-lockup__tagline">
              Find Victorian campsites that match your dates, drive time, weather, and must-have facilities.
            </p>
          </div>

          {/* Three steps */}
          <div className="steps-row">
            {/* Step 1 — When? */}
            <div className="step">
              <div className="step__label">
                <span className="step__number">1</span>
                <span className="step__name">When?</span>
              </div>
              <p className="step__prompt">
                {selectedDate
                  ? isMultiDateSelection
                    ? `${selectedDates.length}-night trip selected.`
                    : 'Single night selected. Add an end date for a range.'
                  : 'Pick your arrival date to check availability and weather.'}
              </p>
              <div className="step__dates">
                <div className="step__dates-group">
                  <span className="step__dates-sublabel">From</span>
                  <input
                    id="forecast-date"
                    type="date"
                    value={selectedDate}
                    min={new Date().toISOString().slice(0, 10)}
                    onChange={(event) => setSelectedDate(event.target.value)}
                    className="step__input"
                  />
                </div>
                {selectedDate ? (
                  <div className="step__dates-group">
                    <span className="step__dates-sublabel">To (optional)</span>
                    <input
                      id="forecast-end-date"
                      type="date"
                      value={selectedEndDate}
                      min={selectedDate || new Date().toISOString().slice(0, 10)}
                      onChange={(event) => setSelectedEndDate(event.target.value)}
                      className="step__input"
                    />
                  </div>
                ) : null}
              </div>
              {selectedDates.length > 0 && !isWeatherEligible ? (
                <p className="step__hint step__hint--warn">
                  Beyond 14 days — weather forecast and filters unavailable.
                </p>
              ) : selectedDate ? (
                <p className="step__hint">
                  Weather forecasts available for the next 14 days.
                </p>
              ) : (
                <p className="step__hint">Forecasts cover the next 14 days.</p>
              )}
            </div>

            {/* Step 2 — Where from? */}
            <div className="step">
              <div className="step__label">
                <span className="step__number">2</span>
                <span className="step__name">Where from?</span>
              </div>
              <p className="step__prompt">
                {originCoords
                  ? `Drive times calculated from ${originCoords.label}.`
                  : 'Enter your suburb or postcode to calculate drive times.'}
              </p>
              <input
                id="origin-postcode"
                list="vic-origin-options"
                inputMode="text"
                placeholder="e.g. 3070 or Northcote"
                value={originPostcode}
                onChange={(event) => setOriginPostcode(event.target.value.trim())}
                className="step__input"
              />
              <datalist id="vic-origin-options">
                {originSuggestions.map((option) => (
                  <option key={option} value={option} />
                ))}
              </datalist>
              {originError ? (
                <p className="step__error">{originError}</p>
              ) : (
                <p className="step__hint">Defaults to Melbourne CBD (3000).</p>
              )}
            </div>

            {/* Step 3 — How far? */}
            <div className="step">
              <div className="step__label">
                <span className="step__number">3</span>
                <span className="step__name">How far?</span>
              </div>
              <p className="step__prompt">
                How long are you happy to drive?
              </p>
              <div className="step__slider-row">
                <input
                  id="drive-time"
                  type="range"
                  min={30}
                  max={maxAvailableDriveMinutes}
                  step={30}
                  value={maxDriveMinutes}
                  onChange={(event) => setMaxDriveMinutes(Number(event.target.value))}
                  list="drive-time-marks"
                  className="step__slider"
                />
                <span className="step__slider-value">
                  {formatMinutesAsHours(maxDriveMinutes)}
                </span>
              </div>
              <datalist id="drive-time-marks">
                {driveMarks.map((value) => (
                  <option key={value} value={value} label={formatMinutesAsHours(value)} />
                ))}
              </datalist>
              <p className="step__hint">
                {driveTimesLoading ? 'Calculating drive times…' : 'Approximate driving time from your starting point.'}
              </p>
            </div>
          </div>
        </div>
      </div>
```

**Step 2: Run the dev server visually to check the header renders**

```bash
npm run dev
```

Open in browser and confirm: incident banner, brand lockup, 3 steps visible. No console errors.

**Step 3: Commit the header**

```bash
git add src/App.tsx
git commit -m "feat(ui-v2): add guided header with 3-step date/postcode/drivetime flow"
```

---

## Task 4: Add the chip bar and wire up filter state

**Files:**
- Modify: `src/App.tsx` — add chip bar JSX immediately after the guided header closing tag

**Step 1: Add the chip bar JSX**

Immediately after the guided header `</div>` closing tag and before `<main ...>`, insert:

```tsx
      {/* ── Filter chip bar ── */}
      <div className="chip-bar">
        <div className="chip-bar__inner">
          <span className="chip-bar__label">Must have</span>

          {FACILITY_FILTERS.map((filter) => (
            <button
              key={filter.key}
              type="button"
              className={`chip ${facilityFilters[filter.key] ? 'is-active' : ''}`}
              onClick={() =>
                setFacilityFilters((prev) => ({
                  ...prev,
                  [filter.key]: !prev[filter.key],
                }))
              }
              aria-pressed={facilityFilters[filter.key] ?? false}
            >
              {filter.label}
            </button>
          ))}

          <div className="chip-bar__divider" aria-hidden="true" />
          <span className="chip-bar__label">Weather</span>

          <button
            type="button"
            className={`chip ${!allowHeat && selectedDates.length > 0 && isWeatherEligible ? 'is-active' : ''} ${
              !selectedDates.length || !isWeatherEligible ? 'is-disabled' : ''
            }`}
            onClick={() => setAllowHeat((v) => !v)}
            disabled={!selectedDates.length || !isWeatherEligible}
            title={
              !selectedDates.length
                ? 'Select a date to enable weather filters'
                : !isWeatherEligible
                  ? 'Weather filters only available within 14 days'
                  : undefined
            }
            aria-pressed={!allowHeat}
          >
            Avoid heat (&gt;33°C)
          </button>

          <button
            type="button"
            className={`chip ${!allowRain && selectedDates.length > 0 && isWeatherEligible ? 'is-active' : ''} ${
              !selectedDates.length || !isWeatherEligible ? 'is-disabled' : ''
            }`}
            onClick={() => setAllowRain((v) => !v)}
            disabled={!selectedDates.length || !isWeatherEligible}
            title={
              !selectedDates.length
                ? 'Select a date to enable weather filters'
                : !isWeatherEligible
                  ? 'Weather filters only available within 14 days'
                  : undefined
            }
            aria-pressed={!allowRain}
          >
            Avoid rain
          </button>

          {selectedDates.length > 0 ? (
            <>
              <div className="chip-bar__divider" aria-hidden="true" />
              <span className="chip-bar__label">Availability</span>
              {AVAILABILITY_FILTERS.map((filter) => (
                <button
                  key={filter.key}
                  type="button"
                  className={`chip ${availabilityFilters[filter.key] ? 'is-active' : ''}`}
                  onClick={() =>
                    setAvailabilityFilters((current) => ({
                      ...current,
                      [filter.key]: !current[filter.key],
                    }))
                  }
                  aria-pressed={availabilityFilters[filter.key] ?? false}
                >
                  {filter.label}
                </button>
              ))}
            </>
          ) : null}
        </div>
      </div>
```

**Step 2: Fix the weather chip logic**

Note: The current `allowHeat` / `allowRain` state means "allow this condition" (i.e. `true` = don't filter it out). The chip should read as "Avoid heat" being active when `allowHeat` is `false`. The logic above handles this correctly — active chip = filtering active = `allowHeat === false`.

However, to keep the logic consistent with existing state, the chip click toggles `allowHeat`. Since `allowHeat = false` means "filter out hot sites", the chip being active visually means "this filter is ON". When clicked, it flips `allowHeat` (turning the filter off). This is correct.

**Step 3: Build to check no TypeScript errors**

```bash
npm run build
```

Expected: clean build.

**Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat(ui-v2): add filter chip bar for facilities, weather, and availability"
```

---

## Task 5: Replace the main content area (remove sidebar, full-width results)

**Files:**
- Modify: `src/App.tsx` — replace `<main ...>` block

**Step 1: Replace the `<main>` block**

Find the current `<main className="px-6 pb-16 sm:px-10">` block. Replace it entirely with:

```tsx
      {/* ── Results ── */}
      <div className="content-area">
        <div className="content-area__inner">
          <div className="results-bar">
            <div className="results-bar__count">
              <strong>{filteredSites.length}</strong> campsite{filteredSites.length !== 1 ? 's' : ''} found
            </div>
            <div className="view-toggle">
              <button
                type="button"
                className={`view-toggle__button ${viewMode === 'list' ? 'is-active' : ''}`}
                onClick={() => setViewMode('list')}
                aria-pressed={viewMode === 'list'}
                aria-label="List view"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M6 7h12M6 12h12M6 17h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
              <button
                type="button"
                className={`view-toggle__button ${viewMode === 'map' ? 'is-active' : ''}`}
                onClick={() => setViewMode('map')}
                aria-pressed={viewMode === 'map'}
                aria-label="Map view"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M4 6l6-2 5 2 5-2v14l-5 2-5-2-6 2V6z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                  <path d="M10 4v14M15 6v14" stroke="currentColor" strokeWidth="1.8" />
                </svg>
              </button>
            </div>
          </div>

          {status === 'loading' && (
            <div className="rounded-2xl bg-white/70 p-6 text-ink/70 mt-4">
              Loading campgrounds…
            </div>
          )}
          {status === 'error' && (
            <div className="rounded-2xl bg-white/70 p-6 text-ember mt-4">
              Could not load campgrounds. Check `public/data/sites.json`.
            </div>
          )}

          {status === 'idle' && viewMode === 'list' && (
            <div className="campground-grid mt-4">
              {/* CARD LOOP — unchanged from original, paste the existing filteredSites.map() block here verbatim */}
              {filteredSites.map((site) => {
                // ... (paste full card rendering block from original App.tsx lines ~1329-1656 verbatim)
              })}
            </div>
          )}

          {status === 'idle' && viewMode === 'map' && (
            <>
              <MapView
                sites={filteredSites}
                origin={originCoords}
                onSiteClick={(siteId) => setSelectedMapSiteId(siteId)}
              />
              {/* map card overlay — paste unchanged from original */}
            </>
          )}
        </div>
      </div>
    </div>
  )
```

**IMPORTANT:** The card rendering block (the `filteredSites.map(...)` body) and the map card overlay are 100% unchanged from the original. Paste them verbatim — do not rewrite card internals.

**Step 2: Run tests**

```bash
npm run test
```

Expected: all tests pass (the dataset test reads `sites.json` directly — unaffected).

**Step 3: Build**

```bash
npm run build
```

Expected: clean build, no TypeScript errors.

**Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat(ui-v2): replace sidebar layout with full-width results and results bar"
```

---

## Task 6: Visual polish pass

**Files:**
- Modify: `src/index.css` — targeted tweaks

**Step 1: Update the `body` background to use the sand/fog palette**

In `src/index.css`, find the existing `body { ... background: ... }` rule and update to:

```css
body {
  margin: 0;
  font-family: var(--font-body);
  color: var(--color-text-primary);
  background: #f9fafb;
  line-height: 1.6;
  min-height: 100vh;
}
```

(The gradient was nice but the sand header now provides the warm zone. The results area should be clean light grey.)

**Step 2: Update `--font-display` to Fraunces**

In `:root`, change:
```css
--font-display: 'Fraunces', ui-serif, serif;
```

And add to the Google Fonts import at line 1:
```css
@import url('https://fonts.googleapis.com/css2?family=Work+Sans:wght@400;500;600;700&family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,600;0,9..144,700;1,9..144,400&display=swap');
```

(Replace the existing Inter/Lexend import entirely — Work Sans and Fraunces are already in `uno.config.ts` tokens.)

**Step 3: Run dev server and do a visual check**

```bash
npm run dev
```

Verify:
- Sand-coloured guided header
- 3 numbered steps visible
- Chip bar below header with facility chips
- Full-width card grid with Fraunces headings on cards
- Mobile: steps stack vertically, chips wrap

**Step 4: Commit**

```bash
git add src/index.css
git commit -m "style(ui-v2): polish body background and font imports for v2 design"
```

---

## Task 7: Final check and memory note

**Step 1: Run full test suite**

```bash
npm run test
```

Expected: all tests pass.

**Step 2: Run lint**

```bash
npm run lint
```

Fix any issues, commit if needed.

**Step 3: Build**

```bash
npm run build
```

Expected: clean.

**Step 4: Confirm rollback works**

Verify the branch setup is solid:

```bash
git log --oneline -8
git branch
```

Should show `ui-v2` branch with multiple commits. `main` is untouched.

**Step 5: Commit final state**

```bash
git add -A
git commit -m "feat(ui-v2): complete guided-header UI redesign — rollback via git checkout main"
```
