const fs = require('fs');
const file = 'd:/usher/Documents/Capstone Project/Web Portal/src/pages/Landing.tsx';
let data = fs.readFileSync(file, 'utf8');

const servicesStart = data.indexOf('      {/* ── Services ────────────────────────────────────────────────────────── */}');
const aboutStart = data.indexOf('      {/* ── About Us ────────────────────────────────────────────────────────── */}');
const showcaseStart = data.indexOf('      {/* ── Featured Projects Slider ─────────────────────────────────────── */}');
const faqStart = data.indexOf('      {/* ── FAQ ──────────────────────────────────────────────────────────── */}');

const servicesBlock = data.substring(servicesStart, aboutStart);
const aboutValuesBlock = data.substring(aboutStart, showcaseStart);

// Remove the contact section mock
const contactStr = '      <section id="contact" ref={contactRef} className="px-0 py-0" />\n';
let newAboutValuesBlock = aboutValuesBlock.replace(contactStr, '');

// Reorder: Home -> AppBanner -> Stats -> About Us -> Core Values -> Services
const newContent = newAboutValuesBlock + servicesBlock;

let newData = data.substring(0, servicesStart) + newContent + data.substring(showcaseStart);

// add the contact section mock right before branch locations
const branchStart = newData.indexOf('      {/* ── Branch Locations ────────────────────────────────────────── */}');
newData = newData.substring(0, branchStart) + contactStr + newData.substring(branchStart);

fs.writeFileSync(file, newData);
console.log('Done!');
