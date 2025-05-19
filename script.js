// const { log } = require("console");

// const { log } = require("console");

// const socket = io("http://192.168.137.69:5000");
const socket = io("https://new-audio-server.onrender.com");

const peers = {};
let localStream;
let myUsername;
let pendingCall = null;
let pendingInvite = null;
let activeCallParticipants = new Set(); // Track active call participants

async function getTurnConfig() {
  const res = await fetch('https://new-audio-server.onrender.com/turn-credentials');
  const data = await res.json();
  return data.iceServers;
}

const ice = getTurnConfig()

// ICE Server configuration for better connectivity
const iceServers={ iceServers:ice}
// const iceServers = {
//   iceServers: [
//     // STUN servers
//     { urls: 'stun:stun.l.google.com:19302' },
//     { urls: 'stun:stun1.l.google.com:19302' },
//     { urls: 'stun:stun2.l.google.com:19302' },
//     { urls: 'stun:stun3.l.google.com:19302' },
//     { urls: 'stun:stun4.l.google.com:19302' },
//     // TURN servers with TCP fallback
//     {
//       urls: [
//         'turn:openrelay.metered.ca:80',
//         'turn:openrelay.metered.ca:443',
//         'turn:openrelay.metered.ca:443?transport=tcp'
//       ],
//       username: 'openrelayproject',
//       credential: 'openrelayproject',
//       credentialType: 'password'
//     },
//     {
//       urls: [
//         'turn:numb.viagenie.ca',
//         'turn:numb.viagenie.ca:3478',
//         'turn:numb.viagenie.ca:3478?transport=tcp'
//       ],
//       username: 'webrtc@live.com',
//       credential: 'muazkh',
//       credentialType: 'password'
//     }
//   ],
//   iceCandidatePoolSize: 10,
//   iceTransportPolicy: 'all',
//   bundlePolicy: 'max-bundle',
//   rtcpMuxPolicy: 'require',
//   iceServersPolicy: 'all'
// };

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

    // Emit login event and request online users
    socket.emit("login", myUsername);
    
    // Request online users list after login
    socket.emit("get-online-users");
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
        sampleSize: 16
        // codec: 'PCM'
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
    iceCandidatePoolSize: 10
  });

  // Add reconnection attempt counter
  let reconnectAttempts = 0;
  const MAX_RECONNECT_ATTEMPTS = 3;
  let iceGatheringTimeout = null;
  let connectionTimeout = null;
  let usingTurn = false;

  // Function to force TURN usage
  const  forceTurnUsage = () => {
    console.log(`Forcing TURN usage for ${peerId}`);
    const turnOnlyConfig = {
      ...iceServers,
      iceTransportPolicy: 'relay', // Force TURN only
      iceServers: iceServers.iceServers.filter(server => {
        // Handle both string and array URLs
        const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
        return urls.some(url => url.startsWith('turn:'));
      })
    };
    pc.setConfiguration(turnOnlyConfig);
    pc.restartIce();
  };

  // Add SDP modification to ensure G.711 codec and proper ICE handling
//   pc.onnegotiationneeded = async () => {
//   try {
//     const offer = await pc.createOffer();
//     await pc.setLocalDescription(offer);
//     // Send offer to peer via signaling server
//   } catch (error) {
//     console.error("Negotiation error:", error);
//   }
// };

// error

  // pc.onnegotiationneeded = async () => {
  //   try {
  //     const offer = await pc.createOffer({
  //       offerToReceiveAudio: true,
  //       offerToReceiveVideo: false,
  //       iceRestart: true
  //     });
      
  //     // Create a new SDP with proper codec configuration
  //     let modifiedSdp = offer.sdp;
      
  // //     // Find the audio m-line and its payload types
  //     const audioMLineMatch = modifiedSdp.match(/m=audio.*\r\n/);
  //     if (!audioMLineMatch) {
  //       throw new Error('No audio m-line found in SDP');
  //     }
      
  //     const audioMLine = audioMLineMatch[0];
  //     const payloadTypes = audioMLine.split(' ').slice(3); // Get payload types from m-line
      
  //     // Find an available payload type (prefer 0 if available)
  //     let selectedPayloadType = '0';
  //     if (!payloadTypes.includes('0')) {
  //       // Find first available payload type
  //       for (let i = 0; i < 96; i++) {
  //         if (!payloadTypes.includes(i.toString())) {
  //           selectedPayloadType = i.toString();
  //           break;
  //         }
  //       }
  //     }
      
  //     // Create new SDP with only PCM codec
  //     modifiedSdp = modifiedSdp
  //       // Replace m-line with single payload type
  //       .replace(/m=audio.*\r\n/, `m=audio 9 UDP/TLS/RTP/SAVPF ${selectedPayloadType}\r\n`)
  //       // Remove all existing codec mappings
  //       .replace(/a=rtpmap:\d+ .*\r\n/g, '')
  //       // Remove all fmtp lines
  //       .replace(/a=fmtp:\d+ .*\r\n/g, '')
  //       // Remove all rtcp-fb lines
  //       .replace(/a=rtcp-fb:\d+ .*\r\n/g, '')
  //       // Remove all extmap lines
  //       .replace(/a=extmap:\d+ .*\r\n/g, '')
  //       // Remove all mid lines
  //       .replace(/a=mid:.*\r\n/g, '')
  //       // Remove all msid lines
  //       .replace(/a=msid:.*\r\n/g, '')
  //       // Remove all ssrc lines
  //       .replace(/a=ssrc:.*\r\n/g, '')
  //       // Remove all ssrc-group lines
  //       .replace(/a=ssrc-group:.*\r\n/g, '')
  //       // Remove rtcp-mux
  //       .replace(/a=rtcp-mux\r\n/g, '')
  //       // Remove rtcp-rsize
  //       .replace(/a=rtcp-rsize\r\n/g, '')
  //       // Set setup to actpass
  //       .replace(/a=setup:.*\r\n/g, 'a=setup:actpass\r\n')
  //       // Enable trickle ICE
  //       .replace(/a=ice-options:.*\r\n/g, 'a=ice-options:trickle\r\n')
  //       // Set direction to sendonly
  //       .replace(/a=sendrecv\r\n/g, 'a=sendonly\r\n')
  //       // Set direction to sendrecv
  //       .replace(/a=recvonly\r\n/g, 'a=sendrecv\r\n');
      
  //     // Add PCM codec mapping with selected payload type
  //     modifiedSdp = modifiedSdp.replace(
  //       /(m=audio.*\r\n)/,
  //       `$1a=rtpmap:${selectedPayloadType} PCM/8000\r\n`
  //     );
      
  //     const modifiedOffer = {
  //       ...offer,
  //       sdp: modifiedSdp
  //     };
      
  //     await pc.setLocalDescription(modifiedOffer);
  //   } catch (error) {
  //     console.error('Error during negotiation:', error);
  //     // If setting local description fails, try with original offer
  //     try {
  //       await pc.setLocalDescription(offer);
  //     } catch (retryError) {
  //       console.error('Error setting original offer:', retryError);
  //     }
  //   }
  // };

pc.onnegotiationneeded = async () => {
  try {
    const offer = await pc.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: false,
      iceRestart: true
    });

    let modifiedSdp = offer.sdp;

    // Find the audio m-line
    const audioMLineMatch = modifiedSdp.match(/m=audio.*\r\n/);
    if (!audioMLineMatch) {
      throw new Error('No audio m-line found in SDP');
    }

    const selectedPayloadType = '0'; // PCMU
    const midMatch = modifiedSdp.match(/a=mid:(\S+)\r\n/);
    const mid = midMatch ? midMatch[1] : '0';

    modifiedSdp = modifiedSdp
      .replace(/m=audio .*\r\n/, `m=audio 9 UDP/TLS/RTP/SAVPF ${selectedPayloadType}\r\n`)
      .replace(/a=rtpmap:\d+ .*\r\n/g, '')
      .replace(/a=fmtp:\d+ .*\r\n/g, '')
      .replace(/a=rtcp-fb:\d+ .*\r\n/g, '')
      .replace(/a=extmap:\d+ .*\r\n/g, '')
      .replace(/a=mid:.*\r\n/g, '')
      .replace(/a=msid:.*\r\n/g, '')
      .replace(/a=ssrc:.*\r\n/g, '')
      .replace(/a=ssrc-group:.*\r\n/g, '')
      // KEEP a=rtcp-mux or you'll break BUNDLE
      // .replace(/a=rtcp-mux\r\n/g, '')
      .replace(/a=rtcp-rsize\r\n/g, '')
      .replace(/a=setup:.*\r\n/g, 'a=setup:actpass\r\n')
      .replace(/a=ice-options:.*\r\n/g, 'a=ice-options:trickle\r\n')
      .replace(/a=sendrecv\r\n/g, 'a=sendonly\r\n')
      .replace(/a=recvonly\r\n/g, 'a=sendrecv\r\n');

    // Re-insert required lines
    modifiedSdp = modifiedSdp.replace(
      /(m=audio.*\r\n)/,
      `$1a=rtpmap:${selectedPayloadType} PCMU/8000\r\n` +
      `a=mid:${mid}\r\n`
    );

    const modifiedOffer = {
      type: offer.type,
      sdp: modifiedSdp
    };

    await pc.setLocalDescription(modifiedOffer);
  } catch (error) {
    console.error('Error during negotiation:', error);
    try {
      await pc.setLocalDescription(offer);
    } catch (retryError) {
      console.error('Error setting original offer:', retryError);
    }
  }
};


  pc.ontrack = (event) => {
    console.log('Received remote track from:', peerId);
    const remoteAudio = document.createElement("audio");
    remoteAudio.autoplay = true;
    remoteAudio.playsinline = true;
    remoteAudio.srcObject = event.streams[0];
    remoteAudio.id = `audio-${peerId}`;
    document.getElementById("remoteAudios").appendChild(remoteAudio);
    
    // Initialize DTMF sender when track is received
    const audioSender = pc.getSenders().find(sender => 
      sender.track && sender.track.kind === 'audio'
    );
    if (audioSender?.dtmf) {
      dtmfSenders.set(peerId, audioSender.dtmf);
    }
    
    updateActiveStreams();
  };

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      console.log('ICE candidate:', event.candidate);
      
      // Check if this is a TURN candidate
      if (event.candidate.candidate.indexOf('relay') !== -1) {
        console.log('Using TURN server for connection');
        usingTurn = true;
      }

      // Only send ICE candidates if they are not host candidates (to avoid local network issues)
      if (event.candidate.candidate.indexOf('host') === -1) {
        socket.emit("ice-candidate", {
          toUserId: peerId,
          candidate: event.candidate,
        });
      }
    } else {
      console.log('ICE gathering completed for:', peerId);
      if (iceGatheringTimeout) {
        clearTimeout(iceGatheringTimeout);
        iceGatheringTimeout = null;
      }
    }
  };

  pc.onicegatheringstatechange = () => {
    console.log(`ICE gathering state for ${peerId}:`, pc.iceGatheringState);
    if (pc.iceGatheringState === 'gathering') {
      // Set a timeout for ICE gathering
      iceGatheringTimeout = setTimeout(() => {
        console.log(`ICE gathering timeout for ${peerId}, forcing TURN usage`);
        forceTurnUsage();
      }, 5000); // 5 seconds timeout
    }
  };

  pc.oniceconnectionstatechange = () => {
    console.log(`ICE connection state with ${peerId}:`, pc.iceConnectionState);
    
    // Handle ICE connection state changes
    switch (pc.iceConnectionState) {
      case 'checking':
        // Set a timeout for connection establishment
        if (connectionTimeout) clearTimeout(connectionTimeout);
        connectionTimeout = setTimeout(() => {
          if (pc.iceConnectionState === 'checking') {
            console.log(`Connection establishment timeout for ${peerId}, forcing TURN usage`);
            forceTurnUsage();
          }
        }, 5000); // 5 seconds timeout
        break;
      case 'failed':
        if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          console.log(`Attempting to reconnect with ${peerId} (attempt ${reconnectAttempts + 1})`);
          reconnectAttempts++;
          forceTurnUsage();
        } else {
          console.log(`Max reconnection attempts reached for ${peerId}`);
          removeParticipant(peerId);
        }
        break;
      case 'disconnected':
        // Don't immediately remove on disconnected state
        console.log(`Connection with ${peerId} is disconnected, waiting for recovery...`);
        // Set a timeout for recovery
        setTimeout(() => {
          if (pc.iceConnectionState === 'disconnected') {
            console.log(`Recovery timeout for ${peerId}, forcing TURN usage`);
            forceTurnUsage();
          }
        }, 3000); // 3 seconds timeout
        break;
      case 'connected':
        console.log(`Connection established with ${peerId}`);
        // Clear any pending timeouts
        if (connectionTimeout) {
          clearTimeout(connectionTimeout);
          connectionTimeout = null;
        }
        if (iceGatheringTimeout) {
          clearTimeout(iceGatheringTimeout);
          iceGatheringTimeout = null;
        }
        // Reset reconnect attempts on successful connection
        reconnectAttempts = 0;
        console.log(`Connection established with ${peerId} using ${usingTurn ? 'TURN' : 'direct connection'}`);
        break;
      case 'closed':
        removeParticipant(peerId);
        break;
    }
  };

  pc.onconnectionstatechange = () => {
    console.log(`Connection state with ${peerId}:`, pc.connectionState);
    
    // Handle connection state changes
    switch (pc.connectionState) {
      case 'connecting':
        // Set a timeout for connection establishment
        if (connectionTimeout) clearTimeout(connectionTimeout);
        connectionTimeout = setTimeout(() => {
          if (pc.connectionState === 'connecting') {
            console.log(`Connection establishment timeout for ${peerId}, restarting ICE`);
            pc.restartIce();
          }
        }, 15000); // 15 seconds timeout
        break;
      case 'failed':
        if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          console.log(`Attempting to reconnect with ${peerId} (attempt ${reconnectAttempts + 1})`);
          reconnectAttempts++;
          // Try to restart ICE
          pc.restartIce();
        } else {
          console.log(`Max reconnection attempts reached for ${peerId}`);
          removeParticipant(peerId);
        }
        break;
      case 'disconnected':
        // Don't immediately remove on disconnected state
        console.log(`Connection with ${peerId} is disconnected, waiting for recovery...`);
        // Set a timeout for recovery
        setTimeout(() => {
          if (pc.connectionState === 'disconnected') {
            console.log(`Recovery timeout for ${peerId}, attempting to restart ICE`);
            pc.restartIce();
          }
        }, 5000); // 5 seconds timeout for recovery
        break;
      case 'connected':
        // Clear any pending timeouts
        if (connectionTimeout) {
          clearTimeout(connectionTimeout);
          connectionTimeout = null;
        }
        // Reset reconnect attempts on successful connection
        reconnectAttempts = 0;
        break;
      case 'closed':
        removeParticipant(peerId);
        break;
    }
  };

  // Add connection recovery monitoring
  let connectionCheckInterval = setInterval(() => {
    if (pc.connectionState === 'disconnected' || pc.iceConnectionState === 'disconnected') {
      if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        console.log(`Attempting to recover connection with ${peerId} (attempt ${reconnectAttempts + 1})`);
        reconnectAttempts++;
        // Force TURN usage by restarting ICE
        pc.restartIce();
      } else {
        console.log(`Max reconnection attempts reached for ${peerId}`);
        clearInterval(connectionCheckInterval);
        removeParticipant(peerId);
      }
    } else if (pc.connectionState === 'connected' && pc.iceConnectionState === 'connected') {
      // Reset reconnect attempts on successful connection
      reconnectAttempts = 0;
    }
  }, 5000); // Check every 5 seconds

  // Store the interval ID for cleanup
  pc.connectionCheckInterval = connectionCheckInterval;
  pc.connectionTimeout = connectionTimeout;
  pc.iceGatheringTimeout = iceGatheringTimeout;

  return pc;
}

function removeParticipant(peerId) {
  if (peers[peerId]) {
    // Clear all timeouts and intervals
    if (peers[peerId].connectionCheckInterval) {
      clearInterval(peers[peerId].connectionCheckInterval);
    }
    if (peers[peerId].connectionTimeout) {
      clearTimeout(peers[peerId].connectionTimeout);
    }
    if (peers[peerId].iceGatheringTimeout) {
      clearTimeout(peers[peerId].iceGatheringTimeout);
    }
    
    peers[peerId].close();
    delete peers[peerId];
  }
  dtmfSenders.delete(peerId);
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
  // Check if user is already in the call
  if (activeCallParticipants.has(toUser)) {
    console.warn(`Cannot call ${toUser}: Already in call with this user`);
    return;
  }

  try {
    const pc = createPeerConnection(toUser);
    peers[toUser] = pc;
    activeCallParticipants.add(toUser);

    // Add local stream tracks
    localStream.getTracks().forEach((track) => {
      pc.addTrack(track, localStream);
    });

    // Create and set local description
    const offer = await pc.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: false
    });
    
    await pc.setLocalDescription(offer);

    // Emit call-user event
    socket.emit("call-user", {
      toUserId: toUser,
      offer: pc.localDescription,
    });

    console.log(`Call initiated with ${toUser}`);
  } catch (error) {
    console.error("Error starting call:", error);
    alert("Failed to start call. Please try again.");
    removeParticipant(toUser);
  }
}

function inviteUser(toUser) {
  // Check if user is already in the call
  if (activeCallParticipants.has(toUser)) {
    console.warn(`Cannot invite ${toUser}: Already in call with this user`);
    return;
  }

  if (activeCallParticipants.size === 0) {
    // If no active call, start a new one
    startCall(toUser);
  } else {
    // If there's an active call, invite to join
    socket.emit("join-call", { joiningUserId: toUser });
  }
}

socket.on("online-users", (users) => {
  console.log("Received online users:", users);
  const container = document.getElementById("onlineUsers");
  container.innerHTML = "";

  if (!Array.isArray(users)) {
    console.error("Received invalid users data:", users);
    return;
  }

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

    if (activeCallParticipants.has(u)) {
      const status = document.createElement("span");
      status.className = "call-status";
      status.textContent = "In Call";
      status.style.color = "var(--success-color)";
      status.style.marginLeft = "0.5rem";
      username.appendChild(status);
    }

    userInfo.appendChild(avatar);
    userInfo.appendChild(username);

    const userActions = document.createElement("div");
    userActions.className = "user-actions";

    const callBtn = document.createElement("button");
    callBtn.textContent = "Call";
    callBtn.disabled = activeCallParticipants.has(u);
    callBtn.onclick = () => startCall(u);

    const inviteBtn = document.createElement("button");
    inviteBtn.textContent = "Invite";
    inviteBtn.disabled = activeCallParticipants.has(u);
    inviteBtn.onclick = () => inviteUser(u);

    userActions.appendChild(callBtn);
    userActions.appendChild(inviteBtn);

    userCard.appendChild(userInfo);
    userCard.appendChild(userActions);
    container.appendChild(userCard);
  });
});

socket.on("incoming-call", async ({ fromUserId, offer }) => {
  try {
    // Store the pending call information
    pendingCall = { fromUserId, offer };
    // console.log(offer);
    
    
    // Show the incoming call notification
    document.getElementById("callerName").textContent = fromUserId;
    document.getElementById("incomingCallNotification").style.display = "block";
  } catch (error) {
    console.error("Error handling incoming call:", error);
    alert("Error receiving call. Please try again.");
  }
});

async function acceptCall() {
  if (!pendingCall) return;
  
  try {
    const { fromUserId, offer } = pendingCall;
    console.log(offer);
    
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
  } catch (error) {
    console.error("Error accepting call:", error);
    alert("Failed to accept call. Please try again.");
    removeParticipant(fromUserId);
  }
}

function rejectCall() {
  if (!pendingCall) return;
  
  try {
    socket.emit("reject-call", {
      toUserId: pendingCall.fromUserId
    });
    
    // Hide the notification
    document.getElementById("incomingCallNotification").style.display = "none";
    pendingCall = null;
  } catch (error) {
    console.error("Error rejecting call:", error);
    alert("Failed to reject call. Please try again.");
  }
}

socket.on("call-answered", async ({ fromUserId, answer }) => {
  try {
    console.log(`Call answered by: ${fromUserId}`);
    if (peers[fromUserId]) {
      await peers[fromUserId].setRemoteDescription(new RTCSessionDescription(answer));
      activeCallParticipants.add(fromUserId);
      updateActiveStreams();
      updateCallState();
    }
  } catch (error) {
    console.error("Error handling call answer:", error);
    alert("Error establishing call connection. Please try again.");
    removeParticipant(fromUserId);
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

      // Update dial pad for new participant
      updateDialPad();
      updateCallState();
    } catch (error) {
      console.error("Error connecting to new participant:", error);
    }
  }
});

// DTMF functionality
let dtmfSenders = new Map();
let dtmfDisplay = "";

async function sendDTMF(digit) {
  if (!activeCallParticipants.size) {
    console.warn('Cannot send DTMF: No active call');
    return;
  }

  console.log('Sending DTMF:', digit);
  let sent = false;

  // Try to send DTMF through all active peer connections
  for (const [peerId, pc] of Object.entries(peers)) {
    try {
      // Get or create DTMF sender
      if (!dtmfSenders.has(peerId)) {
        const audioSender = pc.getSenders().find(sender => 
          sender.track && sender.track.kind === 'audio'
        );
        if (audioSender?.dtmf) {
          dtmfSenders.set(peerId, audioSender.dtmf);
        }
      }

      const dtmfSender = dtmfSenders.get(peerId);
      if (dtmfSender) {
        // Ensure the DTMF sender is ready
        if (dtmfSender.canInsertDTMF) {
          dtmfSender.insertDTMF(digit, 100, 50);
          sent = true;
          console.log(`DTMF sent through peer ${peerId}`);
        } else {
          console.warn(`DTMF sender not ready for peer ${peerId}`);
        }
      } else {
        console.warn(`No DTMF sender available for peer ${peerId}`);
      }
    } catch (error) {
      console.error(`Failed to send DTMF through peer ${peerId}:`, error);
    }
  }

  if (!sent) {
    console.warn('No DTMF sender available for any peer');
    return;
  }

  // Update local display
  updateDTMFDisplay(digit);

  // Notify all participants about the DTMF tone
  for (const participant of activeCallParticipants) {
    if (participant !== myUsername) {
      socket.emit("dtmf-tone", {
        toUserId: participant,
        digit: digit,
        sender: myUsername
      });
    }
  }
}

// Add DTMF tone handler
socket.on("dtmf-tone", ({ digit, sender }) => {
  console.log('Received DTMF:', digit, 'from:', sender);
  // Update display for received DTMF tone
  updateDTMFDisplay(digit, sender);
});

function updateDTMFDisplay(digit, sender = null) {
  const display = document.getElementById("dtmfDisplay");
  if (!display) return;

  // Add the digit to the display
  dtmfDisplay += digit;
  
  // Format the display with sender information if available
  if (sender) {
    display.textContent = `${sender}: ${dtmfDisplay}`;
  } else {
    display.textContent = dtmfDisplay;
  }
}

function cleanupDTMF() {
  dtmfSenders.clear();
  dtmfDisplay = "";
  const display = document.getElementById("dtmfDisplay");
  if (display) {
    display.textContent = "";
  }
}

function updateCallState() {
  const callSection = document.getElementById("callSection");
  const dialPad = document.getElementById("dialPad");
  const isActive = activeCallParticipants.size > 0;
  
  if (isActive) {
    callSection.classList.add("call-active");
    dialPad.style.display = "block";
    // Enable DTMF functionality for all participants
    document.querySelectorAll('.dial-btn').forEach(btn => {
      btn.disabled = false;
    });
  } else {
    callSection.classList.remove("call-active");
    dialPad.style.display = "none";
    // Clear DTMF state when call ends
    cleanupDTMF();
  }
}

function leaveCall() {
  if (!activeCallParticipants.size) return;

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
}

// Add handler for participant leaving
socket.on("participant-left", ({ leavingUserId }) => {
  console.log(`Participant left: ${leavingUserId}`);
  removeParticipant(leavingUserId);
  updateCallState();
});

// Update the dial pad HTML to ensure it's accessible to all participants
function updateDialPad() {
  const dialPad = document.getElementById("dialPad");
  if (!dialPad) return;

  dialPad.innerHTML = `
    <h4>Dial Pad</h4>
    <div class="dial-grid">
      <button class="dial-btn" onclick="sendDTMF('1')">1</button>
      <button class="dial-btn" onclick="sendDTMF('2')">2</button>
      <button class="dial-btn" onclick="sendDTMF('3')">3</button>
      <button class="dial-btn" onclick="sendDTMF('4')">4</button>
      <button class="dial-btn" onclick="sendDTMF('5')">5</button>
      <button class="dial-btn" onclick="sendDTMF('6')">6</button>
      <button class="dial-btn" onclick="sendDTMF('7')">7</button>
      <button class="dial-btn" onclick="sendDTMF('8')">8</button>
      <button class="dial-btn" onclick="sendDTMF('9')">9</button>
      <button class="dial-btn" onclick="sendDTMF('*')">*</button>
      <button class="dial-btn" onclick="sendDTMF('0')">0</button>
      <button class="dial-btn" onclick="sendDTMF('#')">#</button>
    </div>
    <div id="dtmfDisplay" class="dtmf-display"></div>
  `;
}

// Add handler for user joined
socket.on("user-joined", (username) => {
  console.log("User joined:", username);
  // Request updated online users list
  socket.emit("get-online-users");
});

// Add handler for user left
socket.on("user-left", (username) => {
  console.log("User left:", username);
  // Request updated online users list
  socket.emit("get-online-users");
});

// Add error handler for socket events
socket.on("error", (error) => {
  console.error("Socket error:", error);
  alert(error);
});
