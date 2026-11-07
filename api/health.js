module.exports = (req, res) => {
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify({ nebula: true, version: "1.0.0", host: "vercel" }));
};
