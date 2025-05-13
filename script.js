// const socket = io("http://192.168.137.69:5000");
const socket = io("https://audioserver.onrender.com");

const peers = {};
let localStream;
let myUsername;
let pendingCall = null;
let pendingInvite = null;

// ICE Server configuration for better connectivity
const iceServers = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' }
  ]
};

// Connection status handling
socket.on('connect', () => {
  console.log('Connected to server');
  document.getElementById('connectionStatus').textContent = 'Connected';
  document.getElementById('connectionStatus').style.color = 'green';
});

socket.on('disconnect', () => {
  console.log('Disconnected from server');
  document.getElementById('connectionStatus').textContent = 'Disconnected';
  document.getElementById('connectionStatus').style.color = 'red';
});

socket.on('connect_error', (error) => {
  console.error('Connection error:', error);
  document.getElementById('connectionStatus').textContent = 'Connection Error';
  document.getElementById('connectionStatus').style.color = 'red';
});

async function login() {
  myUsername = document.getElementById("usernameInput").value.trim();
  if (!myUsername) return alert("Enter username");

  try {
    await setupLocalStream();
    
    document.getElementById("loginSection").style.display = "none";
    document.getElementById("callSection").style.display = "block";
    document.getElementById("myUsername").textContent = myUsername;

    socket.emit("login", myUsername);
  } catch (error) {
    console.error("Failed to setup media stream:", error);
    alert("Failed to access microphone. Please ensure you have granted microphone permissions.");
  }
}

async function setupLocalStream() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ 
      audio: true,
      video: false 
    });
    const localAudio = document.getElementById("localAudio");
    localAudio.srcObject = localStream;
    localAudio.muted = true; // Keep muted to prevent echo
  } catch (error) {
    console.error("Error accessing media devices:", error);
    throw error;
  }
}

function createPeerConnection(peerId) {
  const pc = new RTCPeerConnection(iceServers);

  pc.ontrack = (event) => {
    console.log('Received remote track');
    const remoteAudio = document.createElement("audio");
    remoteAudio.autoplay = true;
    remoteAudio.playsinline = true;
    remoteAudio.srcObject = event.streams[0];
    document.getElementById("remoteAudios").appendChild(remoteAudio);
    updateActiveStreams();
  };

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      console.log('Sending ICE candidate');
      socket.emit("ice-candidate", {
        toUserId: peerId,
        candidate: event.candidate,
      });
    }
  };

  pc.oniceconnectionstatechange = () => {
    console.log('ICE connection state:', pc.iceConnectionState);
  };

  pc.onconnectionstatechange = () => {
    console.log('Connection state:', pc.connectionState);
  };

  return pc;
}

function updateActiveStreams() {
  const streamCount = document.getElementById("remoteAudios").children.length;
  document.getElementById("activeStreams").textContent = streamCount;
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
  // Store the pending call information
  pendingCall = { fromUserId, offer };
  
  // Show the incoming call notification
  document.getElementById("callerName").textContent = fromUserId;
  document.getElementById("incomingCallNotification").style.display = "block";
});

async function acceptCall() {
  if (!pendingCall) return;
  
  const { fromUserId, offer } = pendingCall;
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

  // Hide the notification
  document.getElementById("incomingCallNotification").style.display = "none";
  pendingCall = null;
}

function rejectCall() {
  if (!pendingCall) return;
  
  socket.emit("reject-call", {
    toUserId: pendingCall.fromUserId
  });
  
  // Hide the notification
  document.getElementById("incomingCallNotification").style.display = "none";
  pendingCall = null;
}

socket.on("call-answered", ({ fromUserId, answer }) => {
  peers[fromUserId]?.setRemoteDescription(new RTCSessionDescription(answer));
});

socket.on("call-rejected", ({ fromUserId }) => {
  alert(`Call was rejected by ${fromUserId}`);
  // Clean up the peer connection if it exists
  if (peers[fromUserId]) {
    peers[fromUserId].close();
    delete peers[fromUserId];
  }
});

socket.on("ice-candidate", ({ fromUserId, candidate }) => {
  peers[fromUserId]?.addIceCandidate(new RTCIceCandidate(candidate));
});

socket.on("join-call", async ({ joiningUserId }) => {
  if (joiningUserId === myUsername) return;

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

socket.on("incoming-invite", ({ fromUserId }) => {
  pendingInvite = { fromUserId };
  document.getElementById("inviterName").textContent = fromUserId;
  document.getElementById("incomingInviteNotification").style.display = "block";
});

async function acceptInvite() {
  if (!pendingInvite) return;
  
  const { fromUserId } = pendingInvite;
  
  // Create a new peer connection for the inviter
  const pc = createPeerConnection(fromUserId);
  peers[fromUserId] = pc;

  localStream.getTracks().forEach((track) =>
    pc.addTrack(track, localStream)
  );

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  socket.emit("call-user", {
    toUserId: fromUserId,
    offer: pc.localDescription,
  });

  socket.emit("accept-invite", {
    fromUserId: fromUserId
  });

  // Hide the notification
  document.getElementById("incomingInviteNotification").style.display = "none";
  pendingInvite = null;
}

function rejectInvite() {
  if (!pendingInvite) return;
  
  socket.emit("reject-invite", {
    fromUserId: pendingInvite.fromUserId
  });
  
  // Hide the notification
  document.getElementById("incomingInviteNotification").style.display = "none";
  pendingInvite = null;
}

socket.on("invite-accepted", ({ fromUserId }) => {
  alert(`${fromUserId} has joined the call`);
});

socket.on("invite-rejected", ({ fromUserId }) => {
  alert(`${fromUserId} has declined to join the call`);
});
