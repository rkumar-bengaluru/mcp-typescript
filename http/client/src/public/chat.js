async function send() {
  const input = document.getElementById('input');
  const chat = document.getElementById('chat');
  const message = input.value;
  chat.innerHTML += `<div class="message user">${message}</div>`;
  input.value = '';
  const res = await fetch('/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message })
  });
  const data = await res.json();
  chat.innerHTML += `<div class="message bot">${data.response}</div>`;
}