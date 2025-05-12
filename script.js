// const socket = io("http://192.168.137.69:5000");
const socket = io("https://audioserver.onrender.com/");

const peers = {};
let localStream;
let myUsername;

async function login() {
  myUsername = document.getElementById("usernameInput").value.trim();
  if (!myUsername) return alert("Enter username");

  document.getElementById("loginSection").style.display = "none";
  document.getElementById("callSection").style.display = "block";
  document.getElementById("myUsername").textContent = myUsername;

  socket.emit("login", myUsername);
  await setupLocalStream();
}

async function setupLocalStream() {
  localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  document.getElementById("localAudio").srcObject = localStream;
}

function createPeerConnection(peerId) {
  const pc = new RTCPeerConnection();

  pc.ontrack = (event) => {
    const remoteAudio = document.createElement("audio");
    remoteAudio.autoplay = true;
    remoteAudio.srcObject = event.streams[0];
    document.getElementById("remoteAudios").appendChild(remoteAudio);
  };

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit("ice-candidate", {
        toUserId: peerId,
        candidate: event.candidate,
      });
    }
  };

  return pc;
}

async function startCall(toUser) {
  const pc = createPeerConnection(toUser);
  peers[toUser] = pc;

  localStream.getTracks().forEach((track) =>
    pc.addTrack(track, localStream)
  );

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  socket.emit("call-user", {
    toUserId: toUser,
    offer: pc.localDescription,
  });
}

function inviteUser(toUser) {
  socket.emit("join-call", { joiningUserId: toUser });
}

socket.on("online-users", (users) => {
  const container = document.getElementById("onlineUsers");
  container.innerHTML = "";

  users.forEach((u) => {
    if (u === myUsername) return;

    const userDiv = document.createElement("div");
    userDiv.className = "user";
    userDiv.textContent = u;

    const callBtn = document.createElement("button");
    callBtn.textContent = "Call";
    callBtn.onclick = () => startCall(u);

    const inviteBtn = document.createElement("button");
    inviteBtn.textContent = "Invite";
    inviteBtn.onclick = () => inviteUser(u);

    userDiv.appendChild(callBtn);
    userDiv.appendChild(inviteBtn);
    container.appendChild(userDiv);
  });
});

socket.on("incoming-call", async ({ fromUserId, offer }) => {
  const pc = createPeerConnection(fromUserId);
  peers[fromUserId] = pc;

  await pc.setRemoteDescription(new RTCSessionDescription(offer));

  localStream.getTracks().forEach((track) =>
    pc.addTrack(track, localStream)
  );

  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);

  socket.emit("answer-call", {
    toUserId: fromUserId,
    answer: pc.localDescription,
  });
});

socket.on("call-answered", ({ fromUserId, answer }) => {
  peers[fromUserId]?.setRemoteDescription(new RTCSessionDescription(answer));
});

socket.on("ice-candidate", ({ fromUserId, candidate }) => {
  peers[fromUserId]?.addIceCandidate(new RTCIceCandidate(candidate));
});

socket.on("join-call", async ({ joiningUserId }) => {
  if (joiningUserId === myUsername) return;

  const confirmJoin = confirm(`${joiningUserId} invited you to a conference call. Join?`);
  if (!confirmJoin) return;

  const pc = createPeerConnection(joiningUserId);
  peers[joiningUserId] = pc;

  localStream.getTracks().forEach((track) =>
    pc.addTrack(track, localStream)
  );

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  socket.emit("call-user", {
    toUserId: joiningUserId,
    offer: pc.localDescription,
  });
});

