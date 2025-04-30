export const FollowButton = {
    props: ['userActor', 'currentUserActor', 'isFollowingFunction', 'followFunction', 'unfollowFunction'],
    template: `
      <button
        @click="handleClick"
        :class="{ following: isFollowingFunction(userActor) }"
        v-if="userActor !== currentUserActor"
      >
        {{ isFollowingFunction(userActor) ? 'Following' : 'Follow' }}
      </button>
    `,
    methods: {
      handleClick() {
        if (this.isFollowingFunction(this.userActor)) {
          this.unfollowFunction(this.userActor);
        } else {
          this.followFunction(this.userActor);
        }
      }
    }
  };
  