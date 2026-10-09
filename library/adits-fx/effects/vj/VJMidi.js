/**
 * VJMidi.js — Web MIDI control surface for the Video Jockey deck. // VJ
 * ─────────────────────────────────────────────────────────────────────────────
 * The other half of "software a working VJ would bring to a booth": nobody
 * performs with a mouse. This binds real hardware — knobs, faders, pads —
 * to the deck's channels and actions via **MIDI Learn**: arm a target, touch
 * the physical control, it binds. No CC-number tables, no manual config.
 *
 * Two target kinds, matching how a controller is actually laid out:
 *   channel — a continuous 0..1 value (CC knob/fader). Becomes a `midi` source
 *             on that VJModulator channel, sitting alongside auto/manual/audio/
 *             gesture/pointer as a peer rather than a special case.
 *   action  — a momentary trigger (pad / note-on, or CC ≥ 64 for pad-style CC
 *             controllers). Fires on the RISING edge only, so holding a pad
 *             doesn't retrigger every frame.
 *
 * Actions route through VJDeck's quantize-launch path, so a pad press lands on
 * the next beat/bar instead of cutting instantly — this is where the beat clock
 * and the control surface compound into something neither gives alone.
 *
 * Bindings persist to localStorage (`adits.vj.midi.v1`) so a rig comes back
 * mapped after a reload — same convention as `adits.settings.v1` in main.js.
 *
 * COST WHEN OFF: `navigator.requestMIDIAccess()` — the only real cost, and the
 * only thing that prompts the user for permission — is never called until the
 * toggle is switched on, and every input handler is detached on switch-off.
 * The class itself is plain JS with no heavy imports, so constructing it eagerly
 * costs one localStorage read.
 *
 * BROWSER SUPPORT: Web MIDI is Chromium-only in practice. Adits already targets
 * Chromium for WebGPU/WebCodecs, so this adds no new platform constraint — but
 * the module degrades to a clear "not supported" status rather than throwing.
 */

const STORAGE_KEY = 'adits.vj.midi.v1';

/** Every bindable target. `id` is stable and persisted — do not renumber.
 *  `channel` ids use the `ch.<channelKey>` convention so VJDeck can map a
 *  binding straight onto the matching VJModulator channel. */
export const MIDI_TARGETS = [
    { id: 'ch.progress',    label: 'Scan Position',  kind: 'channel', channelKey: 'progress' },
    { id: 'ch.intensity',   label: 'Intensity',      kind: 'channel', channelKey: 'intensity' },
    { id: 'ch.band',        label: 'Band Width',     kind: 'channel', channelKey: 'band' },
    { id: 'ch.tiling',      label: 'Pattern Scale',  kind: 'channel', channelKey: 'tiling' },
    { id: 'ch.dim',         label: 'Base Dim',       kind: 'channel', channelKey: 'dim' },
    { id: 'act.presetNext', label: 'Next Preset',    kind: 'action' },
    { id: 'act.presetPrev', label: 'Previous Preset', kind: 'action' },
    { id: 'act.randomize',  label: 'Randomize',      kind: 'action' },
    { id: 'act.tapTempo',   label: 'Tap Tempo',      kind: 'action' },
    { id: 'act.toggle',     label: 'Toggle VJ On/Off', kind: 'action' },
];

const targetById = (id) => MIDI_TARGETS.find((t) => t.id === id) || null;

export class VJMidi {
    constructor() {
        this.enabled = false;
        this.supported = typeof navigator !== 'undefined' && typeof navigator.requestMIDIAccess === 'function';
        this.status = this.supported ? 'off' : 'unsupported';
        this.deviceNames = [];

        this.bindings = this._load();   // targetId → { type, channel, number }

        this._values = new Map();       // channel targetId → 0..1
        this._edge = new Map();         // action targetId → last rising-edge state
        this._access = null;
        this._inputs = [];
        this._learnTarget = null;
        this._loading = false;

        this._onMessage = (e) => this._handleMessage(e);
        this._onStateChange = () => this._rebindInputs();

        /** Set by VJDeck: (targetId) => void, fired on an action's rising edge. */
        this.onAction = null;
        /** Set by VJDeck: () => void, fired when status/bindings change (UI refresh). */
        this.onChange = null;
    }

    get learnTarget() { return this._learnTarget; }

    // ── Lifecycle ────────────────────────────────────────────────────────────

    async setEnabled(on) {
        on = !!on;
        if (on === this.enabled) return;

        if (!on) {
            this.enabled = false;
            this._teardown();
            this.status = this.supported ? 'off' : 'unsupported';
            this.onChange?.();
            return;
        }

        if (!this.supported) {
            this.status = 'unsupported';
            this.onChange?.();
            return;
        }
        if (this._loading) return;

        this._loading = true;
        this.enabled = true;
        this.status = 'connecting';
        this.onChange?.();

        try {
            this._access = await navigator.requestMIDIAccess({ sysex: false });
            this._access.onstatechange = this._onStateChange;
            this._rebindInputs();
        } catch (err) {
            console.error('[VJ MIDI] access failed:', err?.message || err);
            this.enabled = false;
            this.status = 'denied';
            this._teardown();
        } finally {
            this._loading = false;
            this.onChange?.();
        }
    }

    /** (Re)attach handlers to every current input — also runs on device
     *  connect/disconnect so plugging a controller in mid-set just works. */
    _rebindInputs() {
        for (const input of this._inputs) input.onmidimessage = null;
        this._inputs = [];
        this.deviceNames = [];

        if (this._access) {
            for (const input of this._access.inputs.values()) {
                input.onmidimessage = this._onMessage;
                this._inputs.push(input);
                this.deviceNames.push(input.name || 'MIDI device');
            }
        }
        if (this.enabled) this.status = this.deviceNames.length ? 'ready' : 'no-devices';
        this.onChange?.();
    }

    _teardown() {
        for (const input of this._inputs) input.onmidimessage = null;
        this._inputs = [];
        if (this._access) this._access.onstatechange = null;
        this._access = null;
        this.deviceNames = [];
        this._values.clear();
        this._edge.clear();
        this._learnTarget = null;
    }

    dispose() { this._teardown(); }

    // ── Incoming MIDI ────────────────────────────────────────────────────────

    _handleMessage(e) {
        const data = e.data;
        if (!data || data.length < 2) return;

        const type = data[0] & 0xF0;
        const channel = (data[0] & 0x0F) + 1;
        const number = data[1];
        const raw = data.length > 2 ? data[2] : 0;

        let msg = null;
        if (type === 0xB0) msg = { type: 'cc', channel, number, value: raw };
        else if (type === 0x90) msg = { type: 'note', channel, number, value: raw };   // vel 0 = note-off
        else if (type === 0x80) msg = { type: 'note', channel, number, value: 0 };
        if (!msg) return;

        if (this._learnTarget) {
            // Ignore note-off so releasing a pad doesn't consume the arm.
            if (msg.type === 'note' && msg.value === 0) return;
            this._bind(this._learnTarget, msg);
            return;
        }
        this._apply(msg);
    }

    _apply(msg) {
        for (const id of Object.keys(this.bindings)) {
            const b = this.bindings[id];
            if (b.type !== msg.type || b.channel !== msg.channel || b.number !== msg.number) continue;

            const target = targetById(id);
            if (!target) continue;

            if (target.kind === 'channel') {
                this._values.set(id, msg.type === 'cc' ? msg.value / 127 : (msg.value > 0 ? 1 : 0));
            } else {
                // Rising edge only — a held pad must not retrigger.
                const high = msg.type === 'note' ? msg.value > 0 : msg.value >= 64;
                if (high && !this._edge.get(id)) this.onAction?.(id);
                this._edge.set(id, high);
            }
        }
    }

    // ── Learn / bindings ─────────────────────────────────────────────────────

    startLearn(targetId) {
        this._learnTarget = targetById(targetId) ? targetId : null;
        this.onChange?.();
    }

    cancelLearn() {
        this._learnTarget = null;
        this.onChange?.();
    }

    _bind(targetId, msg) {
        // One physical control drives one target — steal it from any other
        // target already using the same CC/note so a re-learn can't silently
        // leave two parameters fighting over one knob.
        for (const id of Object.keys(this.bindings)) {
            const b = this.bindings[id];
            if (b.type === msg.type && b.channel === msg.channel && b.number === msg.number) {
                delete this.bindings[id];
                this._values.delete(id);
                this._edge.delete(id);
            }
        }
        this.bindings[targetId] = { type: msg.type, channel: msg.channel, number: msg.number };
        this._learnTarget = null;
        this._save();
        this.onChange?.();
    }

    clearBinding(targetId) {
        if (!this.bindings[targetId]) return;
        delete this.bindings[targetId];
        this._values.delete(targetId);
        this._edge.delete(targetId);
        this._save();
        this.onChange?.();
    }

    clearAll() {
        this.bindings = {};
        this._values.clear();
        this._edge.clear();
        this._learnTarget = null;
        this._save();
        this.onChange?.();
    }

    isBound(targetId) { return !!this.bindings[targetId]; }

    /** Human-readable binding label, e.g. "CC 21 · ch1". */
    describe(targetId) {
        const b = this.bindings[targetId];
        if (!b) return null;
        return `${b.type === 'cc' ? 'CC' : 'Note'} ${b.number} · ch${b.channel}`;
    }

    /** Current 0..1 value for a channel target, or null when nothing has been
     *  received yet — the caller falls back to its manual value, so an armed
     *  but untouched knob never snaps a parameter to zero. */
    getValue(targetId) {
        if (!targetId) return null;
        return this._values.has(targetId) ? this._values.get(targetId) : null;
    }

    // ── Persistence ──────────────────────────────────────────────────────────

    _load() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return {};
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object') return {};
            // Drop anything that no longer maps to a live target (e.g. a target
            // renamed in a later version) rather than carrying dead entries.
            const out = {};
            for (const id of Object.keys(parsed)) {
                const b = parsed[id];
                if (targetById(id) && b && typeof b.number === 'number') out[id] = b;
            }
            return out;
        } catch (_) {
            return {};
        }
    }

    _save() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this.bindings));
        } catch (_) { /* private mode / quota — bindings still work this session */ }
    }
}
