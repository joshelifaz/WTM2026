import fs from "fs";

const html = fs.readFileSync("WTM-Race-Manager.html", "utf8");
const start = html.indexOf("<script>");
const end = html.lastIndexOf("</script>");
const head = html.slice(0, start);
const tail = html.slice(end + "</script>".length);
const script = html.slice(start + "<script>".length, end);

fs.writeFileSync(
  "index.html",
  `${head}<script type="module" src="/src/main.js"></script>${tail}`
);
fs.writeFileSync("src/_legacy-script.js", script);
console.log("Wrote index.html and src/_legacy-script.js");
