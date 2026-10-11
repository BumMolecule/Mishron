// মিশ্রণ: four short original tunes in Bengali folk styles, synthesised in the browser
// with the Web Audio API. No recordings: a bansuri-like flute, ektara and dotara plucks,
// a tanpura-like drone and a khol/madol-like drum, all built from oscillators.
(function () {
  "use strict";

  var Ctx = window.AudioContext || window.webkitAudioContext;
  var btn = document.querySelector("[data-tune]");
  if (!Ctx || !btn) return;

  var SA = 293.66; // D4 as Sa
  var hz = function (semi) { return SA * Math.pow(2, semi / 12); };

  // Each tune: a melody as [semitones from Sa, beats] (null = rest; g = grace note from above),
  // a tempo, a lead voice, and an accompaniment.
  var TUNES = [
    {
      bn: "ভাটিয়ালি", en: "Bhatiyali, in the style of a boatman's river song", bpm: 64, lead: "flute", accomp: "drone",
      melody: [[7,2],[9,1],[7,1],[4,2],[2,1],[4,1],[7,3],[null,1],
               [9,2],[12,1],[9,1],[7,2],[4,1],[2,1],[0,3],[null,1],
               [2,1],[4,1],[7,2],[4,1],[2,1],[0,2],[-3,1],[0,1],[2,3],[null,1],
               [4,1],[2,1],[0,2],[-3,2],[0,4],[null,2]]
    },
    {
      bn: "বাউল", en: "Baul, in the style of the wandering minstrels' songs", bpm: 104, lead: "pluck", accomp: "ektara",
      melody: [[0,0.5],[2,0.5],[4,1],[5,0.5],[4,0.5],[2,1],[4,0.5],[5,0.5],[7,1],[7,0.5],[9,0.5],[10,1],[9,0.5],[7,0.5],[5,1],[4,2],
               [7,0.5],[9,0.5],[10,0.5],[12,0.5],[10,1],[9,0.5],[7,0.5],[9,1],[7,0.5],[5,0.5],[4,1],[2,0.5],[4,0.5],[0,2],
               [4,0.5],[5,0.5],[7,1],[9,0.5],[7,0.5],[5,1],[4,0.5],[2,0.5],[0,1],[2,1],[0,2]]
    },
    {
      bn: "ভাওয়াইয়া", en: "Bhawaiya, in the style of north Bengal's songs of longing", bpm: 76, lead: "flute", accomp: "drone",
      melody: [[0,1],[3,1],[5,1],[7,2,"g"],[8,0.5],[7,0.5],[5,1],[3,1],[5,2],[null,1],
               [3,1],[5,1],[7,1],[10,2,"g"],[8,1],[7,1],[5,1],[3,2],[2,1],[0,3],[null,1],
               [7,1],[10,1],[12,2,"g"],[10,1],[8,1],[7,2],[5,1],[3,1],[5,1],[7,2],[3,1],[2,1],[0,4],[null,2]]
    },
    {
      bn: "ঝুমুর", en: "Jhumur, in the style of the western uplands' dance songs", bpm: 116, lead: "flute", accomp: "madol",
      melody: [[7,0.5],[9,0.5],[12,1],[9,0.5],[7,0.5],[9,1],[7,0.5],[4,0.5],[7,1],[4,0.5],[2,0.5],[4,1],[2,0.5],[0,0.5],[2,2],
               [4,0.5],[7,0.5],[9,1],[7,0.5],[9,0.5],[12,1],[14,0.5],[12,0.5],[9,1],[7,0.5],[4,0.5],[2,1],[4,0.5],[2,0.5],[0,2],
               [7,0.5],[7,0.5],[9,1],[12,0.5],[9,0.5],[7,1],[4,0.5],[2,0.5],[0,1],[2,0.5],[4,0.5],[0,2]]
    }
  ];

  var ctx = null, bus = null, timer = null, playing = false, lastIndex = -1;

  function flute(t, f, dur, grace) {
    var o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain(), g2 = ctx.createGain();
    var lfo = ctx.createOscillator(), lfoGain = ctx.createGain(), lp = ctx.createBiquadFilter();
    o.type = "sine"; o2.type = "triangle";
    if (grace) { o.frequency.setValueAtTime(f * Math.pow(2, 2 / 12), t); o.frequency.exponentialRampToValueAtTime(f, t + 0.09); }
    else o.frequency.setValueAtTime(f, t);
    o2.frequency.setValueAtTime(f * 2, t); g2.gain.value = 0.06;
    lfo.frequency.value = 5.2; lfoGain.gain.setValueAtTime(0, t); lfoGain.gain.linearRampToValueAtTime(f * 0.007, t + Math.min(0.35, dur * 0.6));
    lfo.connect(lfoGain); lfoGain.connect(o.frequency);
    lp.type = "lowpass"; lp.frequency.value = 2600;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.22, t + 0.07);
    g.gain.setValueAtTime(0.2, t + Math.max(0.08, dur - 0.12));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.1);
    o.connect(g); o2.connect(g2); g2.connect(g); g.connect(lp); lp.connect(bus);
    [o, o2, lfo].forEach(function (n) { n.start(t); n.stop(t + dur + 0.15); });
  }

  function pluck(t, f, level, length) {
    var o = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter();
    o.type = "sawtooth"; o.frequency.setValueAtTime(f, t);
    lp.type = "lowpass"; lp.frequency.setValueAtTime(3800, t); lp.frequency.exponentialRampToValueAtTime(500, t + 0.35);
    g.gain.setValueAtTime(level, t); g.gain.exponentialRampToValueAtTime(0.0001, t + length);
    o.connect(lp); lp.connect(g); g.connect(bus);
    o.start(t); o.stop(t + length + 0.05);
  }

  function drone(t, dur) {
    [hz(-12), hz(-5)].forEach(function (f, i) {
      var o = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter();
      o.type = "sawtooth"; o.frequency.value = f;
      lp.type = "lowpass"; lp.frequency.value = 700;
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(i ? 0.025 : 0.035, t + 1.5);
      g.gain.setValueAtTime(i ? 0.025 : 0.035, t + dur - 1); g.gain.linearRampToValueAtTime(0.0001, t + dur);
      o.connect(lp); lp.connect(g); g.connect(bus); o.start(t); o.stop(t + dur + 0.1);
    });
  }

  function drum(t, kind) {
    if (kind === "dum") {
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "sine"; o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(55, t + 0.25);
      g.gain.setValueAtTime(0.45, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      o.connect(g); g.connect(bus); o.start(t); o.stop(t + 0.4);
    } else {
      var len = 0.08, buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * len), ctx.sampleRate), d = buf.getChannelData(0);
      for (var i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
      var n = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), g2 = ctx.createGain();
      n.buffer = buf; bp.type = "bandpass"; bp.frequency.value = 2200; bp.Q.value = 1.2; g2.gain.value = 0.25;
      n.connect(bp); bp.connect(g2); g2.connect(bus); n.start(t);
    }
  }

  // Schedule one pass of a tune starting at time t; returns its length in seconds.
  function schedule(tune, t) {
    var beat = 60 / tune.bpm, at = t;
    tune.melody.forEach(function (n) {
      var dur = n[1] * beat;
      if (n[0] !== null) {
        if (tune.lead === "flute") flute(at, hz(n[0]), dur * 0.95, n[2] === "g");
        else pluck(at, hz(n[0]), 0.22, Math.min(1.2, dur * 1.6));
      }
      at += dur;
    });
    var length = at - t, beats = Math.round(length / beat);
    if (tune.accomp === "drone") drone(t, length);
    for (var b = 0; b < beats; b++) {
      var bt = t + b * beat;
      if (tune.accomp === "ektara") { pluck(bt, hz(b % 2 ? -5 : -12), 0.16, 0.5); if (b % 2) drum(bt + beat / 2, "ta"); }
      if (tune.accomp === "madol") { drum(bt, b % 3 === 0 ? "dum" : "ta"); if (b % 3 === 2) drum(bt + beat / 2, "ta"); }
      if (tune.accomp === "drone" && b % 4 === 0) pluck(bt, hz(-12), 0.08, 1.5);
    }
    return length;
  }

  function play() {
    if (!ctx) ctx = new Ctx();
    if (ctx.state === "suspended") ctx.resume();
    var i; do { i = Math.floor(Math.random() * TUNES.length); } while (TUNES.length > 1 && i === lastIndex);
    lastIndex = i;
    var tune = TUNES[i];
    bus = ctx.createGain(); bus.gain.value = 0.9;
    var comp = ctx.createDynamicsCompressor(); bus.connect(comp); comp.connect(ctx.destination);
    var loop = function (start) {
      var len = schedule(tune, start);
      timer = setTimeout(function () { if (playing) loop(start + len); }, (start + len - ctx.currentTime - 0.5) * 1000);
    };
    playing = true;
    loop(ctx.currentTime + 0.1);
    btn.setAttribute("aria-pressed", "true");
    btn.setAttribute("aria-label", "Stop the folk tune (" + tune.en + ")");
  }

  function stop() {
    playing = false;
    clearTimeout(timer);
    if (bus) { var b = bus; b.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.08); setTimeout(function () { b.disconnect(); }, 600); bus = null; }
    btn.setAttribute("aria-pressed", "false");
    btn.setAttribute("aria-label", "Play a Bengali folk tune");
  }

  btn.hidden = false;
  btn.addEventListener("click", function () { if (playing) stop(); else play(); });
})();
