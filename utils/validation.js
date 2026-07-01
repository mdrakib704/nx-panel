export function validateEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export function validatePassword(password) {
  return password && password.length >= 8;
}

export function validateUsername(username) {
  return username && username.length >= 3 && username.length <= 32 && /^[a-zA-Z0-9_-]+$/.test(username);
}

export function validateServerName(name) {
  return name && name.length >= 1 && name.length <= 64 && /^[a-zA-Z0-9_-\s]+$/.test(name);
}

export function validatePort(port) {
  const portNum = parseInt(port);
  return portNum >= 25565 && portNum <= 65535;
}

export function sanitizeInput(input) {
  if (typeof input !== 'string') return '';
  return input.replace(/[<>"']/g, char => {
    const map = { '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#x27;' };
    return map[char];
  });
}

export function validateJSON(str) {
  try {
    JSON.parse(str);
    return true;
  } catch {
    return false;
  }
}
