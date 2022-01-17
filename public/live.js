"use strict";

let app = new Vue({
  el: "#live-chats",
  data: {
    chats: [],
    text: "",
    name: localStorage.getItem("name"),
    SECRET: localStorage.getItem("SECRET"),
    isImage: false,
    err: "",
    disabled: false,
    zeroAge: false,
    replyTo: "",
    onlineUsers: [],
    notifsOpened: false,
    logsOpened: false,
    notifs: [],
    seen: Date.now(),
    doc: document,
    favs: localStorage.getItem('fav-chats') || '',
    compose: false,
    socket: io(),
    chatLogs: [],
    typist: "",
    typeTimeout: 3000,
    spotTimeout: 3000,
    typeTimer: null,
    chatQuery: "",
    favOnly: false
  },
  methods: {
    loadChats() {
      fetch("/loadChats", {
        method: "POST",
        body: JSON.stringify({ limit: this.chats.length > 7 ? this.chats.length : 7 }),
        headers: { "Content-Type": "application/json" }
      })
        .then(res => res.json())
        .then(resp => {
          // console.log(resp);
          this.chats = resp.chats.reverse();
        });
    },
    addChat() {
      this.disabled = true;

      let chat = {
        name: this.name,
        text: this.isImage ? `<img src="${this.text}" class="chat-image">` : this.text,
        replyTo: +this.replyTo.substr(1),
        SECRET: localStorage.getItem("SECRET"),
        flagged: ''
      };

      this.socket.emit('add-chat', chat);
    },
    flagChat(evt) {
      // console.log(+evt.target.closest(".chat-box").id.substr(1));
      if(confirm("Are you sure to flag this chat?\nYou can have a maximum of 2 active flags!")) {
        let chat = {
          time: +evt.target.closest(".chat-box").id.substr(1),
          name: this.name,
          SECRET: this.SECRET
        };

        fetch("/flagChat", {
          method: "POST",
          body: JSON.stringify(chat),
          headers: { "Content-Type": "application/json" }
        })
          .then(res => res.json())
          .then(resp => {
            if(resp.msg == 'success') {
              this.loadChats();
            } else {
              alert(resp.msg);
            }
          });
      }
    },
    deleteChat(evt) {
      if(confirm("Are you sure to delete this chat?\nYou may loose some data.")) {
        let chat = {
          time: +evt.target.closest(".chat-box").id.substr(1),
          name: this.name,
          SECRET: this.SECRET
        };

        this.socket.emit('delete-chat', chat);
      }
    },
    getChats() {
      fetch("/getChats", {
        method: "POST",
        body: JSON.stringify({ time: this.chats[0].time }),
        headers: { "Content-Type": "application/json" }
      })
        .then(res => res.json())
        .then(resp => {
          // console.log(resp);
          this.chats.unshift(...resp.chats.reverse());
          this.zeroAge = (resp.chats.length !== 7);
        });
    },
    getNotifs() {
      let user = {
        name: this.name,
        SECRET: this.SECRET
      };

      fetch("/getNotifs", {
        method: "POST",
        body: JSON.stringify(user),
        headers: { "Content-Type": "application/json" }
      })
        .then(res => res.json())
        .then(resp => {
          // console.log(resp);
          this.notifs = resp.notifs;
        });
    },
    spotChat(sel) {
      [ ...document.querySelectorAll('.chat-box') ].map(box => box.classList.remove('spot-light'));
      // console.log(sel);
      try {
        document.querySelector(sel).classList.add('spot-light');
        if(/\#c\d+$/g.test(location.href)) {
          location.href = location.href;
        }
      } catch(e) {
        if(!this.zeroAge) {
          this.getChats();
          setTimeout(() => this.spotChat(sel), this.spotTimeout);
        }
      }
    },
    toggleFav(evt) {
      let time = +evt.target.id.substr(1);
      if(evt.target.checked) {
        this.favs += time + ',';
      } else {
        this.favs = this.favs.replace(new RegExp(`${time},`, 'g'), '');
      }
      console.log(time);
      localStorage.setItem('fav-chats', this.favs);
    },
    filterChats(chat) {
      // console.log(this.chatQuery);
      if(/^".+"$/.test(this.chatQuery)) {
        return chat.text.includes(this.chatQuery.match(/^"(.+)"$/)[1]);
      } else if(/^\[.+\]$/.test(this.chatQuery)) {
        return chat.name.includes(this.chatQuery.match(/^\[(.+)\]$/)[1]);
      } 
      return true;
    },
    logOut() {
      localStorage.setItem("logged", "false");
      localStorage.setItem("name", "");
      localStorage.setItem("SECRET", "");
      location.href = '/';
    }
  },
  mounted() {
    if(/\#c\d+$/g.test(location.href)) {
      setTimeout(() => {
        location.href = location.href;
        this.spotChat(location.href.match(/\#c\d+$/g));
      }, this.spotTimeout);
    }
  },
  created() {
    this.onlineUsers.push(this.name);
    this.socket.emit('user-in', this.SECRET);
    this.socket.on('error', console.log);

    this.socket.on('recent-chats', chats => {
      this.chats = chats.reverse();
      this.chatLogs.push({ text: `Welcome to the chat, ${this.name}!`, time: Date.now() });
    });

    this.socket.on('unread-notifs', () => {
      alert('You have unread notifications!');
      // document.title += ' 🗲';
    });

    this.socket.on('user-in', name => {
      this.onlineUsers.push(name);
      this.chatLogs.push({ text: `${name} entered the chat`, time: Date.now() });
    });

    this.socket.on('users-online', arr => {
      this.onlineUsers = arr;
    });

    this.socket.on('typing', name => {
      if(this.typeTimer) {
        clearTimeout(this.typeTimer);
      }

      this.typist = name;
      this.typeTimer = setTimeout(() => {
        this.typist = '';
        clearTimeout(this.typeTimer);
      }, this.typeTimeout);
    });

    this.socket.on('new-chat', chat => {
      this.disabled = false;
      this.chats.push(chat);
      // console.log(chat);
      if(chat.name == this.name) {
        this.text = "";
        this.src = "";
        this.replyTo = "";
      }
    });

    this.socket.on('chat-deleted', time => {
      let idx = this.chats.findIndex(val => val.time == time);
      this.chats.splice(idx, 1);
    });

    this.socket.on('user-out', name => {
      this.onlineUsers.splice(this.onlineUsers.indexOf(name), 1);
      this.chatLogs.push({ text: `${name} left the chat`, time: Date.now() });
    });
  },
  beforeCreate() {
    window.onpageshow = evt => {
      document.title = 'You are live';
      if (localStorage.getItem("logged") != "true")
        window.location.href = "/";
    };
    // to make it SSL secured!
    location.protocol = 'https' + location.href[4];
  }
});
