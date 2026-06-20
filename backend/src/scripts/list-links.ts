export default async function listLinks({ container }) {
  const remoteLink = container.resolve("remoteLink");
  
  // Dump all keys and methods of remoteLink
  console.log("RemoteLink Keys:", Object.keys(remoteLink));
  console.log("RemoteLink Prototype Keys:", Object.getOwnPropertyNames(Object.getPrototypeOf(remoteLink)));
  
  // If there's a getter or method to inspect links
  try {
    const relations = remoteLink.getRelations?.() || remoteLink.relations_ || [];
    console.log("Registered Relations:");
    console.log(relations);
  } catch (e) {
    console.error("Error reading relations:", e.message);
  }
}
