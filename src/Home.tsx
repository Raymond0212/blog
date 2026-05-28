import HomeContent from "@/content/homeContent.mdx";

const Home = () => {
  const currentYear = new Date().getFullYear();
  const exp = currentYear - 2022;

  return <HomeContent exp={exp}/>;
};

export default Home;
