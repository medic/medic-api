module.exports = function(message) {
  const err = new Error(message);
  err.publicMessage = message;
  return err;
}
