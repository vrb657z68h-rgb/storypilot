// Sicherheitsabfragen vor dem Löschen
document.addEventListener('submit', (ev) => {
  const frage = ev.target.getAttribute('data-bestaetigen');
  if (frage && !window.confirm(frage)) ev.preventDefault();
});

// Zeichen- und Hashtag-Zähler im Beitragsformular
const feld = document.getElementById('text');
const zaehler = document.getElementById('zaehler');
if (feld && zaehler) {
  const zaehle = () => {
    const tags = (feld.value.match(/#[\p{L}\p{N}_]+/gu) || []).length;
    zaehler.textContent = `${feld.value.length} / 2.200 Zeichen · ${tags} / 30 Hashtags`;
    zaehler.className = 'klein' + (tags > 30 ? ' rot' : '');
  };
  feld.addEventListener('input', zaehle);
  zaehle();
}

// Hinweis nach dem Absenden eines großen Videos
const upload = document.querySelector('form[enctype="multipart/form-data"]');
if (upload) {
  upload.addEventListener('submit', () => {
    const knopf = upload.querySelector('button');
    if (knopf) { knopf.disabled = true; knopf.textContent = 'Wird hochgeladen …'; }
  });
}

// Bei Storys das Textfeld ausblenden
const artWahl = document.getElementById('art');
if (artWahl) {
  const umschalten = () => {
    const story = artWahl.value === 'story';
    document.getElementById('textfeld').hidden = story;
    document.getElementById('zaehler').hidden = story;
    document.getElementById('storyhinweis').hidden = !story;
  };
  artWahl.addEventListener('change', umschalten);
  umschalten();
}

// Adressen zum Kopieren antippen
for (const f of document.querySelectorAll('input.kopieren')) {
  f.addEventListener('click', () => {
    f.select();
    if (navigator.clipboard) navigator.clipboard.writeText(f.value).then(() => { f.classList.add('kopiert'); setTimeout(() => f.classList.remove('kopiert'), 1200); });
  });
}
