"use strict";

let app = new Vue({
  el: "#index",
  data: {
    names: [],
    name: "",
    rName: /^[a-z]{4,15}$/i,
    disabled: false,
    newUser: false,
    backendErr: ""
  },
  methods: {
    doAuth(evt) {
      evt.preventDefault();
      this.disabled = true;

      let user = {
        name: this.name,
        task: this.newUser ? 'reg_user' : 'log_user'
      };

      fetch("/authUser", {
        method: "POST",
        body: JSON.stringify(user),
        headers: { "Content-Type": "application/json" }
      })
        .then(res => res.json())
        .then(resp => {
          this.disabled = false;
          // alert(JSON.stringify(resp));
          if("redir" in resp) {
            localStorage.setItem("logged", "true");
            localStorage.setItem("name", this.name);
            localStorage.setItem("SECRET", resp.SECRET);
            window.location.href = resp.redir;
          } else {
            this.backendErr = "Message from server: " + resp.msg;
            // console.log(resp.msg);
          }
        });
    }
  },
  created() {
    fetch("/getNames", {
      method: "GET"
    })
      .then(res => res.json())
      .then(resp => {
        console.log(resp);
        this.names = resp.names;
      });
  },
  beforeCreate() {
    window.onpageshow = evt => {
      if (localStorage.getItem("logged") == "true")
        window.location.href = "/live";
    };
    // to make it SSL secured!
    location.protocol = 'https' + location.href[4];
  }
});
