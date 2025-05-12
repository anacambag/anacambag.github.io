import { createApp } from "vue";
import { GraffitiLocal } from "@graffiti-garden/implementation-local";
import { GraffitiRemote } from "@graffiti-garden/implementation-remote";
import { GraffitiPlugin } from "@graffiti-garden/wrapper-vue";
import { FollowButton } from './FollowButton.js';


createApp({
  data() {
    return {
      myMessage: "",
      myMessageChannel: "",
      sending: false,
      channels: ["designftw"],
      groupName: "",
      selectedGroup: null,
      currentView: 'chats',
      userChannel: null,            
      joinedGroupRecords: new Set(),   
      chatFilter: 'all',
      books_API: [],
      categories: ["Currently Reading","Finished Reading" ,"Want to Read"],
      currentBook: null,
      newChatName: "",
      isLoadingJoinedGroups: false,
      userProfile: null,
      viewedUserProfile: null,
      newUserForm: {
        username: "",
        pronouns: "",
        bio: "",
        profileImg: "/api/placeholder/150/150" //  placeholder
      },
      followersCount: {},  
      followingCount: {},
      followListType: null, // 'followers' or 'following'
      followListUser: null, // which user's follows to display
      users: [],
      showChatMembers: false,
      chatMembers: [],
      isFirstLogin: false,
      followedUsers: new Set(),
      editProfile: false,
      communityTab: 'books',
      allFollowRelationships: {}, 
      navigationStack: [],
      chatListUser: null,
      viewedUserProfileChatCount: 0,
      googleBooksQuery: '',
      activeDropdownMessageId: null,
      searchQueryChats: '',
      searchQueryUsers: '',
      searchQueryBooks: '',
    };
  },
  watch: {
    '$graffitiSession.value': {
      async handler(session) {
        if (!session?.actor) return;
        this.userChannel = session.actor;
        this.newUserForm.username = session.actor;
        this.loadJoinedGroups();
        
        // Check if the user has registered before
        this.isFirstLogin = await this.checkFirstTimeUser(session);
        
        if (this.isFirstLogin) {
          this.currentView = 'registration';
        } else {          
          await this.loadUserProfile(session);
        }
        
        await this.loadAllUsers();
        await this.loadFollowedUsers();
        await this.loadFollowerCounts();
        await this.loadAllFollowers();
        // await this.sendInfoToClass();
        
        this.loadBookListAndBootstrap(session)
          .then(() => this.bootstrapGroupChats(session))
          .catch(console.error);
      },
      immediate: true
    }
  },
  

  methods: {

    async checkFirstTimeUser(session) {
      let isFirstTime = true;
      try {
        const schema = {};
        for await (const msg of this.$graffiti.discover(['booksms:users'], schema)) {     
          if (msg.object.actor === session.actor) {
            isFirstTime = false;
            break;
          }
        }
      } catch (err) {
        console.error("Error checking if user exists:", err);
      }
      return isFirstTime;
    },
    
    async registerUser(session) {
      if (!this.newUserForm.username) {
        alert("Username is required!");
        return;
      }
      
      try {
        const userProfile = {
          username: this.newUserForm.username,
          name: this.newUserForm.name,
          pronouns: this.newUserForm.pronouns,
          bio: this.newUserForm.bio,
          profileImg: this.newUserForm.profileImg,
          joinedAt: Date.now(),
          actor: session.actor
        };
        
        await this.$graffiti.put(
          {
            value: { 
              type: 'UserProfile',
              profile: userProfile
            },
            channels: ['booksms:users']
          },
          session
        );
        
        this.userProfile = userProfile;
        this.isFirstLogin = false;
        // this.currentView = 'profile';
        this.navigateTo('profile');
      } catch (err) {
        console.error("Error registering user:", err);
        alert("Failed to register. Please try again.");
      }
    },
    
    async loadUserProfile(session) {
      try {
        const schema = {};
        for await (const msg of this.$graffiti.discover(['booksms:users'], schema)) {
          if (msg.object.actor === session.actor) {
            this.userProfile = msg.object.value.profile;
            break;
          }
        }
      } catch (err) {
        console.error("Error loading user profile:", err);
      }
    },
    
    async loadAllUsers() {
      try {
        const users = [];
        const schema = {};
        
        for await (const msg of this.$graffiti.discover(['booksms:users'], schema)) {
     
          if (msg.object.actor !== this.$graffitiSession.value?.actor) {
            users.push({
              actor: msg.object.actor,
              profile: msg.object.value.profile,
              url: msg.object.url
            });
          }
        }
        
        this.users = users;
      } catch (err) {
        console.error("Error loading users:", err);
      }
    },

    async followUser(userActor) {
      try {
        await this.$graffiti.put(
          {
            value: {
              followedActor: userActor,
              followedAt: Date.now()
            },
            channels: [`${this.userChannel}:follows`]
          },
          this.$graffitiSession.value
        );
        
        this.followedUsers.add(userActor);
        await this.loadFollowerCounts();
        await this.loadAllFollowers(); 
      } catch (err) {
        console.error("Error following user:", err);
      }
    },
    
    async unfollowUser(userActor) {
      try {
        for await (const msg of this.$graffiti.discover([`${this.userChannel}:follows`], {})) {
          
          if (msg.object.value.followedActor === userActor) {

            await this.$graffiti.delete(msg.object.url, this.$graffitiSession.value);
            this.followedUsers.delete(userActor);
            await this.loadFollowerCounts();
            await this.loadAllFollowers();

            break;
          }
        }
      } catch (err) {
        console.error("Error unfollowing user:", err);
      }
    },
    
    async loadFollowedUsers() {
      try {
        const followed = new Set();
        
        for await (const msg of this.$graffiti.discover([`${this.userChannel}:follows`], {})) {
          followed.add(msg.object.value.followedActor);
        }
        
        this.followedUsers = followed;
      } catch (err) {
        console.error("Error loading followed users:", err);
      }
    },
    
    isFollowing(userActor) {
      return this.followedUsers.has(userActor);
    },
    
    async updateUserProfile() {
      if (!this.userProfile) return;
    
      const updatedProfile = {
        username: this.userProfile.username,
        name: this.userProfile.name,
        pronouns: this.userProfile.pronouns,
        bio: this.userProfile.bio,
        profileImg: this.userProfile.profileImg,
        joinedAt: this.userProfile.joinedAt,
        actor: this.userProfile.actor,
        updatedAt: Date.now()
      };
    
      try {
        const iterator = this.$graffiti.discover(['booksms:users'], {});
        for await (const msg of iterator) {
          if (msg.object.actor === this.$graffitiSession.value?.actor) {

            await this.$graffiti.patch(
              {
                value: [
                  { op: "replace", path: "/profile", value: updatedProfile }
                ]
              },
              msg.object.url,
              this.$graffitiSession.value
            );
            break;
          }
        }
      } catch (err) {
        console.error(err);
      }
    },

    
    async loadFollowerCounts() {
      const followerCounts = {};
      const followingCounts = {};
      
     
      for (const user of this.users) {
        followerCounts[user.actor] = 0;
        followingCounts[user.actor] = 0;
      }
      
      
      followerCounts[this.userChannel] = 0;
      followingCounts[this.userChannel] = 0;
      
      
      for (const user of [...this.users, {actor: this.userChannel}]) {
        try {
          for await (const msg of this.$graffiti.discover([`${user.actor}:follows`], {})) {
            const followedActor = msg.object.value.followedActor;
            
     
            followingCounts[user.actor] = (followingCounts[user.actor] || 0) + 1;
            
            
            if (followerCounts[followedActor] !== undefined) {
              followerCounts[followedActor] += 1;
            }
          }
        } catch (err) {
          console.error(`Error loading follows for ${user.actor}:`, err);
        }
      }
      
      this.followersCount = followerCounts;
      this.followingCount = followingCounts;
    },

    async followUser(userActor) {
      try {
        await this.$graffiti.put(
          {
            value: {
              followedActor: userActor,
              followedAt: Date.now()
            },
            channels: [`${this.userChannel}:follows`]
          },
          this.$graffitiSession.value
        );
        
        this.followedUsers.add(userActor);
        await this.loadFollowerCounts(); 
      } catch (err) {
        console.error("Error following user:", err);
      }
    },
    
    async unfollowUser(userActor) {
      try {
        for await (const msg of this.$graffiti.discover([`${this.userChannel}:follows`], {})) {
          if (msg.object.value.followedActor === userActor) {
            await this.$graffiti.delete(msg.object.url, this.$graffitiSession.value);
            this.followedUsers.delete(userActor);
            await this.loadFollowerCounts(); 
            break;
          }
        }
      } catch (err) {
        console.error("Error unfollowing user:", err);
      }
    },
    async viewFollows(type, user) {
      this.followListType = type;
      this.followListUser = user;
      // this.currentView = 'follows';
      this.navigateTo('follows');
      
    
      await this.loadFollowerCounts();
      
    
      if (type === 'followers') {
        await this.loadAllFollowers();
      }
    },

    async viewChats(user) {
      this.chatListUser = user;
      this.navigateTo('viewChats');
      
  
    },
    getUsernameForActor(actor) {
      // If it's the current user
      if (actor === this.userChannel && this.userProfile) {
        return this.userProfile.name;
      }
    
      if (this.viewedUserProfile && actor === this.viewedUserProfile.actor) {
        return this.viewedUserProfile.name;
      }
    
      const user = this.users.find(u => u.actor === actor);
      return user?.profile?.name || actor;
    },

    async loadAllFollowers() {
      try {

        this.allFollowRelationships = {};
        
       
        const allUsersToScan = [...this.users, {actor: this.userChannel}];
        
        // For each user, check who they're following
        for (const user of allUsersToScan) {
          try {
            const schema = {};
            for await (const msg of this.$graffiti.discover([`${user.actor}:follows`], schema)) {
              const followedActor = msg.object.value.followedActor;
              
              
              if (!this.allFollowRelationships[followedActor]) {
                this.allFollowRelationships[followedActor] = [];
              }
              
              
              this.allFollowRelationships[followedActor].push({
                actor: user.actor
              });
            }
          } catch (err) {
            console.error(`Error loading follows for ${user.actor}:`, err);
          }
        }
      } catch (err) {
        console.error("Error loading all followers:", err);
      }
    },
    
    // Method to get followers for a specific user
    getFollowersList(userActor) {
      return this.allFollowRelationships && this.allFollowRelationships[userActor] 
        ? this.allFollowRelationships[userActor] 
        : [];
    },

    async loadBookListAndBootstrap(session) {
      try {
        const res  = await fetch('./bookAPI.json');
        this.books_API = await res.json();
      } catch (err) {
        console.error("Couldn’t load bookAPI.json:", err);
        return;
      }
      await this.bootstrapCatalog(session);
    },

    async fetchAllCatalogBooks() {
      const results = [];
      const schema = {};

      for await (const msg of this.$graffiti.discover(['booksms:catalog'], schema)) {
        results.push(msg);
      }
      return results;
    },

    async fetchBooksFromGoogleAPI() {
      const query = this.googleBooksQuery.trim();
      if (!query) {
        this.books_API = [];
        return;
      }
    
      try {
        const res = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=10`);
        const data = await res.json();
    
        this.books_API = (data.items || []).map(item => {
          const info = item.volumeInfo;
          return {
            bookId: item.id,
            bookTitle: info.title || "Untitled",
            bookImg: info.imageLinks?.thumbnail || '',
            bookPlot: info.description || 'No description available.',
            bookRating: info.averageRating || 'N/A'
          };
        });
      } catch (err) {
        console.error("Google Books API error:", err);
      }
    },

    selectFetchedBook(book) {
      this.currentBook = book.bookId;

      this.addBooks(this.$graffitiSession.value, book);
      this.navigateTo('bookRoom');
    },

    async bootstrapCatalog(session) {
      // existing catalog entries
      const existing = await this.fetchAllCatalogBooks();
      const existingIds = new Set(
        existing.map(o => o.object.value.object.bookId)
      );

      // loop local list and create books that aren't there yet (like if new books where added to the api or somehting)
      for (const book of this.books_API) {
        if (!existingIds.has(book.bookId)) {
          console.log(`Adding to catalog: ${book.bookTitle}`);
          await this.addBooks(session, book);
        } else {
          console.log(`Already in catalog: ${book.bookTitle}`);
        }
      }
    },

    async addBooks(session, opts) {
      try {
        const schema = {};
        for await (const msg of this.$graffiti.discover(['booksms:catalog'], schema)) {
          if (msg.object.value.object.bookId === opts.bookId) {
            console.log(`${opts.bookTitle} already exists in catalog.`);
            return; 
          }
        }
    
        const meta = {
          type:       'BookMetadata',
          channel:    opts.bookId,
          bookId:     opts.bookId,
          bookTitle:  opts.bookTitle,
          bookImg:    opts.bookImg,
          bookPlot:   opts.bookPlot,
          bookRating: opts.bookRating
        };
    
        await this.$graffiti.put(
          {
            value:    { activity: 'Create', object: meta },
            channels: ['booksms:catalog']
          },
          session
        );
    
        console.log(`Book ${opts.bookTitle} added to catalog.`);
      } catch (err) {
        console.error("Error adding book to catalog:", err);
      }
    },
    
    async fetchAllGroupChats() {
      const results = [];
      const schema = {};

      for await (const msg of this.$graffiti.discover(
        ["booksms:catalog:chats"],
        schema
      )) {
        results.push(msg);
      }
      return results;
    },

    
    async bootstrapGroupChats(session) {
      const existing = await this.fetchAllGroupChats();
      const existingChans = new Set(
        existing.map(o => o.object.value.object.channel)
      );

      for (const book of this.books_API) {
        for (const cat of this.categories) {
          const chan = `${book.bookId}-${cat}`;
          if (!existingChans.has(chan)) {
            await this.createGroup(
              session,
              "book",
              {
                bookId:     book.bookId,
                bookTitle:  book.bookTitle,
                bookImg:    book.bookImg,
                bookPlot:   book.bookPlot,
                bookRating: book.bookRating,
                category:   cat
              }
            );
          }
          else {
            console.log(`Already in Groups: ${chan}`);
          }
        }
      }
    },
  

    async loadJoinedGroups() {
      this.isLoadingJoinedGroups = true;
      const objects = new Set();
      const schema = {};
    
      try {
        for await (const msg of this.$graffiti.discover([this.userChannel], schema)) {
          objects.add(msg.object.value.groupChannel);
        }
        this.joinedGroupRecords = objects;
      } catch (err) {
        console.error("Error loading joined groups", err);
      } finally {
        this.isLoadingJoinedGroups = false;
      }
    },

    isJoinedGroup(channel) {
        return this.joinedGroupRecords.has(channel);
      },


    async joinGroup(g) {
        const chan = g.value.object.channel;
        console.log('INFO IS NOT GETTING COMPLETE HERE WHYYYY',g);

      
        const joinRec = {
          value: {
            groupChannel: chan,
            object: g.value.object,
            groupName: `${g.value.object.bookTitle} - ${g.value.object.category}`,
            joinedAt:     Date.now()
          },
          
        };
      
        
        await this.$graffiti.put(
          { value: joinRec.value, channels: [this.userChannel] },
          this.$graffitiSession.value
        );
      
        // locally record so isJoinedGroup() goes from join to joined
        this.joinedGroupRecords.add(chan);
    },

    formatTime(timestamp) {
        if (!timestamp) return '';
        const date = new Date(timestamp);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      },
      
      
      backToChats() {
        // this.currentView = 'chats';
        this.navigateTo('chats');
        this.selectedGroup = null;
        this.myMessageChannel = '';
      },
      
      
      selectGroup(groupObj) {
        let channel, name;
      
        if (groupObj.value.groupChannel) {
          channel = groupObj.value.groupChannel;
          name = groupObj.value.groupName;

        } else if (groupObj.value.object) {
          const o = groupObj.value.object;
          channel = o.channel;
          name = o.name || `${o.bookTitle} - ${o.category}`;
        }
      
        this.selectedGroup = {
          value: {
            object: { name, channel }
          }
        };
      
        this.myMessageChannel = channel;
        // this.currentView = 'chatRoom';
        this.navigateTo('chatRoom');

        
        this.loadChatMembers(channel);
      
        this.$nextTick(() => {
          if (this.$refs.messageInput) {
            this.$refs.messageInput.focus();
          }
        });
      },
      
      async loadChatMembers(chatChannel) {
        this.chatMembers = [];
        const memberActors = new Set();
        const schema = {};
        
        try {

          for await (const user of this.$graffiti.discover(['booksms:users'], schema)) {
            const userActor = user.object.actor;
            
            for await (const msg of this.$graffiti.discover([userActor], schema)) {
              if (msg.object.value.groupChannel === chatChannel) {
                if (!memberActors.has(userActor)) {
                  memberActors.add(userActor);
                  
                  this.chatMembers.push({
                    actor: userActor,
                    profile: user.object.value.profile
                  });
                }
                break;
              }
            }
          }
        } catch (err) {
          console.error("Error loading chat members:", err);
        }
      },

    
    async sendMessage(session) {
      if (!this.myMessage) return;

      this.sending = true;

      await this.$graffiti.put(
        {
          value: {
            content: this.myMessage,
            published: Date.now(),
          },
          channels: [this.myMessageChannel],
        },
        session,
      );

      this.sending = false;
      this.myMessage = "";

      await this.$nextTick();
      this.$refs.messageInput.focus();
    },

    async editMessage(session, message, newContent) {
      await this.$graffiti.patch(
        {
          value: [
            {
              op: "replace",
              path: "/content",
              value: newContent
            }
          ]
        },
        message,
        session
      );
    },

    editMessagePrompt(message) {
      const newContent = prompt("Edit your message:", message.value.content);
      if (newContent && newContent !== message.value.content) {
        this.editMessage(this.$graffitiSession.value, message, newContent);
      }
    },

    async deleteMessage(session, message) {
      await this.$graffiti.delete(message, session);
    },
    

    async createGroup(session, kind, opts) {
        // kind: 'person' or 'book'
        // opts for person: { participants: [you, them] }
        // opts for book: {
        //   bookId,          // ISBN
        //   bookTitle,       // title
        //   bookImg,         // cover image
        //   bookPlot,
        //   bookRating,
        //   category         // 'currently-reading'...
        // }
        
        const channel = kind === 'person'
          ? crypto.randomUUID()
          : `${opts.bookId}-${opts.category}`
      
        const chat = {
          type:       kind === 'person' ? 'Direct Message' : 'Group Chat',
          name:       kind === 'person'
                        ? `${opts.participants[0]}-${opts.participants[1]}`
                        : this.groupName,
          channel,
        }
      
        if (kind === 'person') {
          chat.participants = opts.participants
        } else {
          chat.bookId     = opts.bookId
          chat.bookTitle  = opts.bookTitle
          chat.bookImg    = opts.bookImg
          chat.bookPlot   = opts.bookPlot
          chat.bookRating = opts.bookRating
          chat.category   = opts.category
        }
        await this.$graffiti.put(
          {
            value:    { activity: 'Create', object: chat },
            channels: ['booksms:catalog:chats']   
          },
          session
        )

        this.groupName = ''
    },

    async createBookSpecificChat() {
      if (!this.newChatName || !this.currentBook) return;
      
      const bookDetails = this.books_API.find(book => book.bookId === this.currentBook);
      
      if (!bookDetails) return;
      
      const channel = `${this.currentBook}-custom-${Date.now()}`;
      
      const chat = {
        type: 'Custom Chat',
        channel,
        bookId: this.currentBook,
        bookTitle: bookDetails.bookTitle,
        bookImg: bookDetails.bookImg,
        bookPlot: bookDetails.bookPlot,
        bookRating: bookDetails.bookRating,
        category: this.newChatName,
        createdBy: this.userChannel,
        createdAt: Date.now()
      };
      
      await this.$graffiti.put(
        {
          value: { activity: 'Create', object: chat },
          channels: ['booksms:catalog:chats']   
        },
        this.$graffitiSession.value
      );
      
      await this.joinGroup({value: {object: chat}});
      
      this.newChatName = "";
      
      this.backToBookSpecificList();
    },

    async createDirectMessage(targetUser) {
      try {
        const participants = [this.userChannel, targetUser].sort(); 
        const channelId = `dm-${participants[0]}-${participants[1]}`;
        
        let existingDM = null;
        for await (const group of this.$graffiti.discover([this.userChannel], {})) {
          if (group.object.value.groupChannel && 
              group.object.value.groupChannel.startsWith('dm-') &&
              ((group.object.value.participants && group.object.value.participants.includes(targetUser)) ||
               group.object.value.groupChannel === channelId)) {
                existingDM = group;
                break;
          }
        }
        
        if (existingDM) {
          this.selectGroup(existingDM.object);
          return;
        }
        
        const chat = {
          type: 'Direct Message',
          name: `${this.userChannel}-${targetUser}`,
          channel: channelId,
          participants: participants,
          createdAt: Date.now()
        };
        
        
        let joinRec = {
          value: {
            groupChannel: channelId,
            object: chat,
            groupName: `${this.getUsernameForActor(targetUser)}`,
            joinedAt: Date.now(),
            participants: participants
          }
        };
        
        await this.$graffiti.put(
          { value: joinRec.value, channels: [this.userChannel] },
          this.$graffitiSession.value
        );

        joinRec.value.groupName = `${this.getUsernameForActor(this.userChannel)}`;
        
        // put for secondary user

        await this.$graffiti.put(
          { value: joinRec.value, channels: [targetUser] },
          this.$graffitiSession.value
        );

        this.selectGroup({
          value: {
            object: {
              channel: channelId,
              name: `${this.getUsernameForActor(targetUser)}`
            }
          }
        });

        this.getUserChatCount(targetUser).then(count => {
          this.viewedUserProfileChatCount = count;
        });
        
        this.loadJoinedGroups();
        
      } catch (err) {
        console.error("Error creating direct message:", err);
        alert("Failed to create direct message. Please try again.");
      }
    },

    selectBook(bookObj) {
      this.currentBook = bookObj.value.object.bookId;
      // this.currentView = "bookRoom"
      this.navigateTo('bookRoom');
  
    },

    backToBooks() {
      // this.currentView = 'search';
      this.navigateTo('search');

      this.currentBook = 'null';
    },

    selectBookChats() {
      this.navigateTo('bookChatsListRoom');
    },

    getMissingBookChats(existingChatObjects) {
      const categories = ["Currently Reading", "Finished Reading", "Want to Read"];
      const existing = existingChatObjects
        .filter(o => o.value.object.bookId === this.currentBook)
        .map(o => o.value.object.category);
    
      return categories.filter(cat => !existing.includes(cat));
    },

    async createAndJoinGroup(category) {
      const session = this.$graffitiSession.value;
      const bookDetails = this.books_API.find(book => book.bookId === this.currentBook);
    
      if (!bookDetails) {
        alert("Book info not found.");
        return;
      }
    
      const groupChat = {
        bookId:     bookDetails.bookId,
        bookTitle:  bookDetails.bookTitle,
        bookImg:    bookDetails.bookImg,
        bookPlot:   bookDetails.bookPlot,
        bookRating: bookDetails.bookRating,
        category:   category,
        type: 'Group Chat'
      };
    
      await this.createGroup(session, "book", groupChat);
      
      // fake chat card to show like when a user wants to join but it is fake
      const fakeObj = {
        value: {
          object: {
            channel: `${bookDetails.bookId}-${category}`,
            ...groupChat
          },
          groupChannel: `${bookDetails.bookId}-${category}`,
          groupName: `${bookDetails.bookTitle} - ${category}`
        }
      };
    
      await this.joinGroup(fakeObj);
    },
    
    backToBookProfile() {
      // this.currentView = "bookRoom"
      this.navigateTo('bookRoom');
    },

    addBookSpecificChat() {
      // this.currentView = "addBookChat";
      this.navigateTo('addBookChat');
    },

    backToBookSpecificList() {
      // this.currentView = "bookChatsListRoom";
      this.navigateTo('bookChatsListRoom');
    },

    backToCommunity() {
      // this.currentView = "community";
      this.navigateTo('community');
    },

    async leaveGroup(groupObj) {
      const groupChannel = groupObj.value.groupChannel;
    
      const confirmLeave = confirm(`Are you sure you want to exit the chat "${groupObj.value.groupName}"?`);
      if (!confirmLeave) return;
    
      for await (const msg of this.$graffiti.discover([this.userChannel], {})) {
        
        if (msg.object.value.groupChannel === groupChannel) {
          await this.$graffiti.delete(msg.object.url, this.$graffitiSession.value);
          this.joinedGroupRecords.delete(groupChannel);
          break;
        }

      }
    },

    viewUserProfile_func(actor) {
      // this.currentView = "viewUserProfile";
      if(actor == this.userChannel) {
        this.navigateTo('profile');
      }
      else {
        this.navigateTo('viewUserProfile');
        const user = this.users.find(user => user.actor === actor);
        this.viewedUserProfile = user ? user.profile : null;

        this.getUserChatCount(actor).then(count => {
          this.viewedUserProfileChatCount = count;
        });

      }
      
    },

    goToProfile() {
      // this.currentView = 'profile';
      this.navigateTo('profile');
      
      this.loadUserProfile(this.$graffitiSession.value);
    },

    navigateTo(newView) {
      
      if (this.currentView !== newView) {
        this.navigationStack.push(this.currentView);
      }
      this.currentView = newView;
    },

    goBack() {
      if (this.navigationStack.length > 0) {
        this.currentView = this.navigationStack.pop();
      } else {
        
        this.currentView = 'chats';
      }
    },
    async getUserChatCount(actor) {
      let count = 0;
      try {
        for await (const msg of this.$graffiti.discover([actor], {})) {
          const obj = msg.object.value;

          if (!obj.groupChannel || !obj.object?.type) continue;

          const type = obj.object.type;
          const participants = obj.object.participants || [];

          // this is to count group chats
          if (type === 'Group Chat' || type === 'Custom Chat') {
            count++;
          }
          // this is to count the direct messages only if current user is part of the chat
          else if (type === 'Direct Message' && participants.includes(this.userChannel)) {
            count++;
          }
        }
        
      } catch (err) {
        console.error(`Failed to get chat count for ${actor}:`, err);
      }
      return count;
    },

    async handleLogout() {
      await this.$graffiti.logout(this.$graffitiSession.value);
      location.reload(); 
    },
    

    // async sendInfoToClass(){

    //   await this.$graffiti.put(
    //     {
    //       value: {
    //         name: "Ana Camba Gomes",
    //         generator: "https://anacambag.github.io/",
    //         describes: this.userChannel,
    //       },
    //       channels: [
    //         "designftw-2025-studio1",
    //       ],
    //     },
    //     this.$graffitiSession.value
    //   );

    // },

    
  },  
})
  .component('follow-button', FollowButton)
  .use(GraffitiPlugin, {
    // graffiti: new GraffitiLocal(),
    graffiti: new GraffitiRemote(),
  })
  .mount("#app");
