# Security to-do

- renderer.js inserts data into HTML without escaping (XSS risk). Upload
  validation blocks < > " ` as a stopgap; the website must escape all text it
  displays. Fix in the website-switch step.
