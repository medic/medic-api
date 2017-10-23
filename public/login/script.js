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
    user: document.getElementById('user').value.toLowerCase().trim(),
    password: document.getElementById('password').value
  });

  document.cookie = '';

  post(url, payload, handleResponse);
};

var focusOnPassword = function(e) {
  if (e.keyCode === 13) {
    e.preventDefault();
    document.getElementById('password').focus();
  }
};

var focusOnSubmit = function(e) {
  if (e.keyCode === 13) {
    document.getElementById('login').focus();
  }
};

document.addEventListener('DOMContentLoaded', function() {
  document.getElementById('login').addEventListener('click', submit, false);

  var user = document.getElementById('user');
  user.addEventListener('keydown', focusOnPassword, false);
  user.focus();

  document.getElementById('password')
      .addEventListener('keydown', focusOnSubmit, false);

  if(window.medicmobile_android && medicmobile_android.getAuthedAccounts) {
    // initialise account switcher
    var $existingList = document.getElementById('existing-accounts');
    var $existingTitle = document.getElementById('existing-title');
    var authedAccounts = JSON.parse(medicmobile_android.getAuthedAccounts());
    var i, acc;

    if(!authedAccounts.length) {
      removeEl($existingList);
      removeEl($existingTitle);
      return;
    }

    $existingTitle.removeAttribute('style');
    document.getElementById('new-login-title').removeAttribute('style');

    for(i=0; i<authedAccounts.length; ++i) {
      acc = authedAccounts[i];
      (function(acc) {
        var a = document.createElement('a');
        a.innerHTML = acc;
        a.addEventListener('click', function() {
          medicmobile_android.switchToAuthedAccount(acc);
        });

        var li = document.createElement('li');
        li.appendChild(a);
        $existingList.appendChild(li);
      }(acc));
    }
  }

  function removeEl(e) {
    e.parentNode.removeChild(e);
  }
});
