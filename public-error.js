module.exports = message => {
  const err = new Error(message);
  err.publicMessage = message;
  return err;
};
