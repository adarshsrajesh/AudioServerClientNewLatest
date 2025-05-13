// const socket = io("http://192.168.137.69:5000");
const socket = io("https://audioserver.onrender.com");

const peers = {};
let localStream;
let myUsername;
let pendingCall = null;
let pendingInvite = null;
let activeCallParticipants = new Set(); // Track active call participants

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
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
        sampleRate: 8000,
        sampleSize: 16,
        codec: 'PCM'
      },
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
  const pc = new RTCPeerConnection({
    ...iceServers,
    sdpSemantics: 'unified-plan',
    bundlePolicy: 'max-bundle',
    rtcpMuxPolicy: 'require',
    iceTransportPolicy: 'all',
    codecPreferences: [
      { mimeType: 'audio/PCM', clockRate: 8000, channels: 1 },
      { mimeType: 'audio/G711', clockRate: 8000, channels: 1 }
    ]
  });

  pc.ontrack = (event) => {
    console.log('Received remote track from:', peerId);
    const remoteAudio = document.createElement("audio");
    remoteAudio.autoplay = true;
    remoteAudio.playsinline = true;
    remoteAudio.srcObject = event.streams[0];
    remoteAudio.id = `audio-${peerId}`; // Add unique ID for each remote audio
    document.getElementById("remoteAudios").appendChild(remoteAudio);
    updateActiveStreams();
  };

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      console.log('Sending ICE candidate to:', peerId);
      socket.emit("ice-candidate", {
        toUserId: peerId,
        candidate: event.candidate,
      });
    }
  };

  pc.oniceconnectionstatechange = () => {
    console.log(`ICE connection state with ${peerId}:`, pc.iceConnectionState);
  };

  pc.onconnectionstatechange = () => {
    console.log(`Connection state with ${peerId}:`, pc.connectionState);
    if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
      removeParticipant(peerId);
    }
  };

  // Add SDP modification to ensure G.711 codec
  pc.onnegotiationneeded = async () => {
    try {
      const offer = await pc.createOffer();
      const modifiedOffer = {
        ...offer,
        sdp: offer.sdp.replace(/(m=audio.*\r\n)/g, '$1a=rtpmap:0 PCM/8000\r\n')
      };
      await pc.setLocalDescription(modifiedOffer);
    } catch (error) {
      console.error('Error during negotiation:', error);
    }
  };

  return pc;
}

function removeParticipant(peerId) {
  if (peers[peerId]) {
    peers[peerId].close();
    delete peers[peerId];
  }
  activeCallParticipants.delete(peerId);
  const audioElement = document.getElementById(`audio-${peerId}`);
  if (audioElement) {
    audioElement.remove();
  }
  updateActiveStreams();
  updateCallState();
}

function updateActiveStreams() {
  const streamCount = document.getElementById("remoteAudios").children.length;
  document.getElementById("activeStreams").textContent = streamCount;
}

async function startCall(toUser) {
  const pc = createPeerConnection(toUser);
  peers[toUser] = pc;
  activeCallParticipants.add(toUser);

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
  if (activeCallParticipants.size === 0) {
    // If no active call, start a new one
    startCall(toUser);
  } else {
    // If there's an active call, invite to join
    socket.emit("join-call", { joiningUserId: toUser });
  }
}

socket.on("online-users", (users) => {
  const container = document.getElementById("onlineUsers");
  container.innerHTML = "";

  users.forEach((u) => {
    if (u === myUsername) return;

    const userCard = document.createElement("div");
    userCard.className = "user-card";

    const userInfo = document.createElement("div");
    userInfo.className = "user-info";

    const avatar = document.createElement("div");
    avatar.className = "user-avatar";
    avatar.textContent = u.charAt(0).toUpperCase();

    const username = document.createElement("span");
    username.textContent = u;

    userInfo.appendChild(avatar);
    userInfo.appendChild(username);

    const userActions = document.createElement("div");
    userActions.className = "user-actions";

    const callBtn = document.createElement("button");
    callBtn.textContent = "Call";
    callBtn.onclick = () => startCall(u);

    const inviteBtn = document.createElement("button");
    inviteBtn.textContent = "Invite";
    inviteBtn.onclick = () => inviteUser(u);

    userActions.appendChild(callBtn);
    userActions.appendChild(inviteBtn);

    userCard.appendChild(userInfo);
    userCard.appendChild(userActions);
    container.appendChild(userCard);
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
  activeCallParticipants.add(fromUserId);

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
  updateCallState();
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

socket.on("call-answered", async ({ fromUserId, answer }) => {
  console.log(`Call answered by: ${fromUserId}`);
  if (peers[fromUserId]) {
    await peers[fromUserId].setRemoteDescription(new RTCSessionDescription(answer));
    activeCallParticipants.add(fromUserId);
    updateActiveStreams();
    updateCallState();
  }
});

socket.on("call-rejected", ({ fromUserId }) => {
  console.log(`Call rejected by: ${fromUserId}`);
  alert(`Call was rejected by ${fromUserId}`);
  removeParticipant(fromUserId);
});

socket.on("ice-candidate", ({ fromUserId, candidate }) => {
  peers[fromUserId]?.addIceCandidate(new RTCIceCandidate(candidate));
});

socket.on("join-call", async ({ joiningUserId }) => {
  if (joiningUserId === myUsername) return;

  const pc = createPeerConnection(joiningUserId);
  peers[joiningUserId] = pc;
  activeCallParticipants.add(joiningUserId);

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

socket.on("incoming-invite", async ({ fromUserId }) => {
  pendingInvite = { fromUserId };
  document.getElementById("inviterName").textContent = fromUserId;
  document.getElementById("incomingInviteNotification").style.display = "block";
});

async function acceptInvite() {
  if (!pendingInvite) return;
  
  const { fromUserId } = pendingInvite;
  
  try {
    // Create peer connections with all existing participants
    for (const participant of activeCallParticipants) {
      if (participant !== myUsername) {
        console.log(`Creating connection with existing participant: ${participant}`);
        const pc = createPeerConnection(participant);
        peers[participant] = pc;

        localStream.getTracks().forEach((track) =>
          pc.addTrack(track, localStream)
        );

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        socket.emit("call-user", {
          toUserId: participant,
          offer: pc.localDescription,
        });
      }
    }

    // Create connection with the inviter
    console.log(`Creating connection with inviter: ${fromUserId}`);
    const pc = createPeerConnection(fromUserId);
    peers[fromUserId] = pc;
    activeCallParticipants.add(fromUserId);

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

    // Notify all participants about the new user
    for (const participant of activeCallParticipants) {
      if (participant !== myUsername) {
        socket.emit("new-participant-joined", {
          toUserId: participant,
          newParticipant: myUsername
        });
      }
    }
  } catch (error) {
    console.error("Error accepting invite:", error);
    alert("Failed to join the call. Please try again.");
  }
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

// Add handler for new participant notification
socket.on("new-participant-joined", async ({ newParticipant }) => {
  console.log(`New participant joined: ${newParticipant}`);
  if (!activeCallParticipants.has(newParticipant)) {
    try {
      const pc = createPeerConnection(newParticipant);
      peers[newParticipant] = pc;
      activeCallParticipants.add(newParticipant);

      localStream.getTracks().forEach((track) =>
        pc.addTrack(track, localStream)
      );

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      socket.emit("call-user", {
        toUserId: newParticipant,
        offer: pc.localDescription,
      });
    } catch (error) {
      console.error("Error connecting to new participant:", error);
    }
  }
});

function updateCallState() {
  const callSection = document.getElementById("callSection");
  const dialPad = document.getElementById("dialPad");
  if (activeCallParticipants.size > 0) {
    callSection.classList.add("call-active");
    dialPad.style.display = "block";
  } else {
    callSection.classList.remove("call-active");
    dialPad.style.display = "none";
  }
}

// DTMF functionality
let dtmfSender = null;
let dtmfDisplay = "";

function sendDTMF(digit) {
  if (!dtmfSender) {
    // Get the first active peer connection
    const activePeer = Object.values(peers)[0];
    if (!activePeer) return;

    // Get the audio sender
    const audioSender = activePeer.getSenders().find(sender => 
      sender.track && sender.track.kind === 'audio'
    );
    if (!audioSender) return;

    // Create DTMF sender
    dtmfSender = audioSender.dtmf;
    if (!dtmfSender) return;
  }

  // Send the DTMF tone
  dtmfSender.insertDTMF(digit, 100, 50);
  
  // Update display
  dtmfDisplay += digit;
  document.getElementById("dtmfDisplay").textContent = dtmfDisplay;

  // Notify all participants about the DTMF tone
  for (const participant of activeCallParticipants) {
    if (participant !== myUsername) {
      socket.emit("dtmf-tone", {
        toUserId: participant,
        digit: digit
      });
    }
  }
}

// Add DTMF tone handler
socket.on("dtmf-tone", ({ digit }) => {
  // Update display for received DTMF tone
  dtmfDisplay += digit;
  document.getElementById("dtmfDisplay").textContent = dtmfDisplay;
});

function leaveCall() {
  // Notify all participants that we're leaving
  for (const participant of activeCallParticipants) {
    if (participant !== myUsername) {
      socket.emit("participant-left", {
        toUserId: participant,
        leavingUserId: myUsername
      });
    }
  }

  // Close all peer connections
  for (const [peerId, pc] of Object.entries(peers)) {
    pc.close();
    delete peers[peerId];
  }

  // Clear all remote audio elements
  const remoteAudios = document.getElementById("remoteAudios");
  remoteAudios.innerHTML = "";

  // Clear active participants
  activeCallParticipants.clear();

  // Update UI
  updateCallState();
  updateActiveStreams();

  dtmfDisplay = "";
  document.getElementById("dtmfDisplay").textContent = "";
  dtmfSender = null;
}

// Add handler for participant leaving
socket.on("participant-left", ({ leavingUserId }) => {
  console.log(`Participant left: ${leavingUserId}`);
  removeParticipant(leavingUserId);
  updateCallState();
});
