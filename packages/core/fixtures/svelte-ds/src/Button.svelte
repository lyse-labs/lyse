<script lang="ts">
  export let label: string;
  let count = 0;
</script>

<button class="btn" on:click={() => (count += 1)}>{label} {count}</button>

<style>
  .btn {
    color: #ff0044;
    padding: 13px;
    border-radius: 7px;
  }
</style>
