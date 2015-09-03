var setState = function(className) {
  document.getElementById('form').className = className;
};

var unescape = function(s) {
  return s
    .replace(/&amp;/g,  '&')
    .replace(/&lt;/g,   '<')
    .replace(/&gt;/g,   '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, '\'')
    .replace(/&#x60;/g, '`');
};

var post = function(url, payload, callback) {
  var xmlhttp = new XMLHttpRequest();
  xmlhttp.onreadystatechange = function() {
    if (xmlhttp.readyState === XMLHttpRequest.DONE) {
      callback(xmlhttp);
    }
  };
  xmlhttp.open('POST', url, true);
  xmlhttp.setRequestHeader('Content-Type', 'application/json');
  xmlhttp.send(payload);
};

var handleResponse = function(xmlhttp) {
  if (xmlhttp.status === 200) {
    window.location = unescape(document.getElementById('redirect').value);
  } else if (xmlhttp.status === 401) {
    setState('loginincorrect');
  } else {
    setState('loginerror');
    console.error('Error logging in', xmlhttp.response);
  }
};

var submit = function(e) {
  e.preventDefault();
  if (document.getElementById('form').className === 'loading') {
    // debounce double clicks
    return;
  }
  setState('loading');
  var url = document.getElementById('form').action;
  var payload = JSON.stringify({
    user: document.getElementById('user').value,
    password: document.getElementById('password').value
  });
  post(url, payload, handleResponse);
};

var pressed = function(e) {
  if (e.keyCode === 13) {
    submit(e);
  }
};

var initDom = setInterval(function() {
  if(/^interactive|complete|loaded$/.test(document.readyState)) {
    clearInterval(initDom);
    document.getElementById('user').focus();
    document.getElementById('login').addEventListener('click', submit, false);
    document.getElementById('password').addEventListener('keypress', pressed, false);
  }
}, 10);
