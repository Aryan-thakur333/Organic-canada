export default async function listEverything({ container }) {
  console.log("AVAILABLE SERVICES:")
  console.log(Object.keys(container.registrations).filter(k => k.includes("Module")).join(", "))
}
