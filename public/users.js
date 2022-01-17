"use strict";

let app = new Vue({
  el: "#users",
  data: {
    name: localStorage.getItem("name"),
    users: [],
    rSeen: /\b[a-z]+\b[0-9\s\:]/i,
    key: ''
  },
  filters: {
    filterNames(name) {
      console.log(name, this.key);
      return name.contains(this.key);
    }
  },
  created() {
    fetch("/getUsers", {
      method: "GET"
    })
      .then(res => res.json())
      .then(resp => {
        // console.log(resp);
        this.users = resp.users;
        if(/u\=\w+$/.test(location.href)) {
          this.key = location.href.match(/(?:u\=)(\w+)$/)[1];
        }
      });
  },
  beforeCreate() {
    // to make it SSL secured!
    location.protocol = 'https' + location.href[4];
  }
});
