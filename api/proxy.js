const { proxy } = require("../proxy-core");
module.exports = (req, res) => proxy(req, res);
module.exports.config = { api: { bodyParser: false } };
